/**
 * Self-indexed NFT collection discovery, straight from chain logs.
 *
 * ## Why this exists
 *
 * Every third-party indexer for Monad Mainnet turned out to be gated:
 * BlockVision's account endpoints are Pro-tier only, and Rarible and thirdweb
 * both refuse unauthenticated calls. Rather than make automatic discovery
 * depend on a paid plan, this discovers collections directly from the chain.
 *
 * ## How it works
 *
 * Any ERC-721 a wallet currently holds must at some point have been transferred
 * *to* it — including mints, where `from` is the zero address. So scanning
 * `Transfer(address,address,uint256)` logs filtered on `topics[2] == wallet`
 * yields every collection the wallet has ever received, which is a superset of
 * what it holds now. The hybrid layer then verifies current balances on-chain,
 * so anything since sold simply reads zero and is dropped.
 *
 * ERC-721 is distinguished from ERC-20 structurally: ERC-721 indexes `tokenId`,
 * so its Transfer log has four topics where ERC-20's has three. No allowlist,
 * no provider, no guesswork.
 *
 * ## Endpoint choice
 *
 * This deliberately does NOT use the primary RPC. Measured limits per endpoint
 * for a topic-filtered `eth_getLogs`:
 *
 *   rpc.monad.xyz              100-block hard cap        -> unusable here
 *   rpc1.monad.xyz (Alchemy)   100,000+ blocks OK        -> used
 *   rpc2.monad.xyz             malformed response
 *   rpc3.monad.xyz             1,000-block cap
 *   rpc-mainnet.monadinfra.com range too large
 *
 * Only rpc1 supports ranges wide enough to walk full history.
 *
 * ## Cost, measured
 *
 *   typical wallet     12 requests, ~3s, full history covered
 *   hyperactive wallet request budget exhausted, partial result flagged
 *
 * The budget is the honest tradeoff: a wallet with hundreds of thousands of
 * receive events cannot be fully scanned live. Scanning proceeds newest-first
 * so the most relevant collections surface early, and an incomplete scan is
 * reported as `partial`, never as "no NFTs".
 */

import { getAddress } from "viem";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";
import type { DiscoveredCollection, DiscoveryOutcome, NftDiscoveryProvider } from "./discovery";

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

/** The only Monad endpoint that accepts wide topic-filtered log ranges. */
export const LOG_SCAN_RPC = "https://rpc1.monad.xyz";

export type LogScanOptions = {
  rpcUrl?: string;
  /** Hard cap on requests per wallet. Bounds worst-case latency. */
  maxRequests?: number;
  /** Starting block span per request; shrinks on oversized responses. */
  initialChunk?: number;
  maxChunk?: number;
  minChunk?: number;
  timeoutMs?: number;
};

const walletTopic = (wallet: string) =>
  `0x${"0".repeat(24)}${wallet.slice(2).toLowerCase()}`;

type RpcResponse = {
  result?: { address: string; topics: string[] }[] | string;
  error?: { message?: string; rateLimited?: boolean };
};

export class OnChainLogDiscovery implements NftDiscoveryProvider {
  readonly name = "onchain-log-scan";
  readonly configured = true;

  private readonly rpcUrl: string;
  private readonly maxRequests: number;
  private readonly initialChunk: number;
  private readonly maxChunk: number;
  private readonly minChunk: number;
  private readonly timeoutMs: number;

  constructor(options: LogScanOptions = {}) {
    this.rpcUrl = options.rpcUrl ?? LOG_SCAN_RPC;
    // 22 requests covers full history for an ordinary wallet (measured: 12)
    // with headroom, while capping a pathological wallet near 20 seconds.
    // Scanning newest-first means the budget rarely changes what is found:
    // the hyperactive test wallet surfaced its collection on request one.
    this.maxRequests = options.maxRequests ?? 22;
    this.initialChunk = options.initialChunk ?? 4_000_000;
    this.maxChunk = options.maxChunk ?? 8_000_000;
    this.minChunk = options.minChunk ?? 2_000;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  reproduceCommand(wallet: PortfolioAddress): string {
    return (
      `curl -X POST ${this.rpcUrl} -H "content-type: application/json" ` +
      `-d '{"jsonrpc":"2.0","id":1,"method":"eth_getLogs","params":[{"fromBlock":"0x0",` +
      `"toBlock":"latest","topics":["${TRANSFER_TOPIC}",null,"${walletTopic(wallet)}"]}]}'`
    );
  }

  private async rpc(method: string, params: unknown[]): Promise<RpcResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });

      // A rate-limited endpoint answers with an HTML error page, not JSON.
      // Parsing that blindly throws a confusing "Unexpected token '<'", so
      // detect it and report the real cause.
      const text = await res.text();
      if (!text.startsWith("{") && !text.startsWith("[")) {
        return {
          error: {
            message:
              res.status === 429 || /doctype|<html/i.test(text)
                ? `rate limited by ${this.rpcUrl} (HTTP ${res.status})`
                : `non-JSON response (HTTP ${res.status})`,
            rateLimited: res.status === 429 || /doctype|<html/i.test(text),
          },
        };
      }
      return JSON.parse(text) as RpcResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  async discover(wallet: PortfolioAddress): Promise<DiscoveryOutcome> {
    const target = getAddress(wallet) as PortfolioAddress;

    try {
      const headRes = await this.rpc("eth_blockNumber", []);
      if (typeof headRes.result !== "string") {
        return {
          ok: false,
          wallet: target,
          error: headRes.error?.message ?? "Could not read head block",
          blocked: false,
          reason: "error",
        };
      }

      const head = Number.parseInt(headRes.result, 16);
      const found = new Map<string, DiscoveredCollection>();

      let cursor = head;
      let chunk = this.initialChunk;
      let requests = 0;
      let complete = false;

      // Walk backwards from head so the most recent — and most likely relevant
      // — collections are found first if the budget runs out.
      while (cursor > 0) {
        if (requests >= this.maxRequests) break;

        const from = Math.max(0, cursor - chunk);
        requests++;

        const res = await this.rpc("eth_getLogs", [
          {
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${cursor.toString(16)}`,
            topics: [TRANSFER_TOPIC, null, walletTopic(target)],
          },
        ]);

        if (res.error) {
          // Rate limiting is not a size problem — shrinking would make it worse
          // by issuing more requests. Report it as its own condition.
          if (res.error.rateLimited) {
            return {
              ok: false,
              wallet: target,
              error: res.error.message ?? "rate limited",
              blocked: false,
              reason: "rate-limited",
              partialCollections: [...found.values()],
            };
          }
          // Otherwise almost always "response too large": halve and retry.
          if (chunk > this.minChunk) {
            chunk = Math.floor(chunk / 2);
            continue;
          }
          // Cannot shrink further — stop and report what was found so far.
          break;
        }

        const logs = Array.isArray(res.result) ? res.result : [];
        for (const log of logs) {
          // 4 topics => tokenId is indexed => ERC-721, not ERC-20.
          if ((log.topics?.length ?? 0) !== 4) continue;
          const key = log.address.toLowerCase();
          if (found.has(key)) continue;
          found.set(key, {
            chainId: MONAD_CHAIN_ID,
            contractAddress: getAddress(log.address) as PortfolioAddress,
            // Names come from the contract during on-chain verification.
            name: null,
            claimedQty: null,
          });
        }

        cursor = from - 1;
        if (cursor <= 0) {
          complete = true;
          break;
        }
        // Grow again after a comfortably small response.
        if (logs.length < 500 && chunk < this.maxChunk) {
          chunk = Math.min(this.maxChunk, chunk * 2);
        }
      }

      const collections = [...found.values()];

      // An exhausted budget is a partial result, not an empty wallet. Say so —
      // but still return what was found, since those are real collections.
      if (!complete) {
        return {
          ok: false,
          wallet: target,
          error:
            `Scanned back to block ${cursor.toLocaleString()} of ${head.toLocaleString()} ` +
            `in ${requests} requests and found ${collections.length} collection(s); ` +
            "older history was not reached.",
          blocked: false,
          reason: "error",
          partialCollections: collections,
        };
      }

      return { ok: true, wallet: target, collections };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        wallet: target,
        error: aborted
          ? `Log scan timed out after ${this.timeoutMs}ms`
          : error instanceof Error
            ? error.message.split("\n")[0]!
            : String(error),
        blocked: false,
        reason: "error",
      };
    }
  }
}
