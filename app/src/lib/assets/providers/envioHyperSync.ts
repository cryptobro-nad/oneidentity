/**
 * Envio HyperSync discovery provider.
 *
 * Turns Transfer-family logs (from an injected `TransferLogSource`) into deduped
 * candidate contracts, per asset standard, across a set of wallets. It proposes
 * only — every balance is re-read on-chain by the verification layer (Stage 2).
 *
 * The concrete HyperSync transport (the `@envio-dev/hypersync-client` package or
 * the HTTP `/query` endpoint, both requiring a server-side `ENVIO_API_TOKEN`)
 * lives behind `TransferLogSource` and is wired in Stage 2. This file — the
 * parsing, dedup, limits and honesty of the result — needs no network and is
 * fully covered by fixtures.
 */

import { getAddress } from "viem";
import type { PortfolioAddress } from "@/lib/types";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import type { AssetDiscoveryProvider, TransferLogSource } from "../provider";
import { isLogSourceError } from "../provider";
import { decodeTransferLog } from "../transferLogs";
import type {
  DiscoveryResult,
  DiscoveryStatus,
  FungibleCandidate,
  NftCandidate,
  PartialFailure,
} from "../types";

export type EnvioLimits = {
  maxFungibleCandidates: number;
  maxNftCandidates: number;
  maxTokenIdsPerCollection: number;
};

/** Conservative safety caps. Exceeding any of them yields a `partial` status
 *  rather than an unbounded scan or an OOM. */
export const ENVIO_LIMITS: EnvioLimits = {
  maxFungibleCandidates: 200,
  maxNftCandidates: 200,
  maxTokenIdsPerCollection: 100,
};

type NftAccum = {
  contract: PortfolioAddress;
  standard: "erc721" | "erc1155";
  wallets: Set<string>;
  tokenIds: Set<string>;
};

export class EnvioHyperSyncProvider implements AssetDiscoveryProvider {
  readonly name = "envio";

  constructor(
    private readonly logSource: TransferLogSource,
    private readonly limits: EnvioLimits = ENVIO_LIMITS,
  ) {}

  get configured(): boolean {
    return this.logSource.configured;
  }

  async discover(wallets: readonly PortfolioAddress[]): Promise<DiscoveryResult> {
    const failures: PartialFailure[] = [];
    const fungibles = new Map<string, { c: FungibleCandidate; wallets: Set<string> }>();
    const nfts = new Map<string, NftAccum>();

    let anySourceIncomplete = false;
    let blockedWallets = 0;
    let scannedToBlock: bigint | undefined;
    let archiveHeight: bigint | undefined;

    const normalisedWallets = wallets.map((w) => getAddress(w) as PortfolioAddress);

    // Sequential per wallet: a free-tier log source is rate-limited, and the
    // existing NFT scan already proved parallel wallets trip those limits.
    for (const wallet of normalisedWallets) {
      const outcome = await this.logSource.collectIncomingTransfers(wallet);

      if (isLogSourceError(outcome)) {
        failures.push({ scope: "wallet", wallet, reason: outcome.reason, blocked: outcome.blocked });
        if (outcome.blocked) blockedWallets++;
        continue;
      }

      if (!outcome.complete) anySourceIncomplete = true;
      if (outcome.scannedToBlock !== undefined) {
        scannedToBlock =
          scannedToBlock === undefined
            ? outcome.scannedToBlock
            : outcome.scannedToBlock < scannedToBlock
              ? outcome.scannedToBlock
              : scannedToBlock;
      }
      if (outcome.archiveHeight !== undefined) archiveHeight = outcome.archiveHeight;

      for (const row of outcome.rows) {
        const decoded = decodeTransferLog(row);
        if (!decoded) continue;

        if (decoded.standard === "erc20") {
          const key = `${MONAD_CHAIN_ID}:${decoded.contract.toLowerCase()}`;
          const existing = fungibles.get(key);
          if (existing) {
            existing.wallets.add(wallet.toLowerCase());
          } else {
            fungibles.set(key, {
              c: {
                chainId: MONAD_CHAIN_ID,
                contractAddress: decoded.contract,
                standard: "erc20",
                wallets: [],
                source: "envio",
              },
              wallets: new Set([wallet.toLowerCase()]),
            });
          }
          continue;
        }

        // ERC-721 / ERC-1155
        const key = `${MONAD_CHAIN_ID}:${decoded.contract.toLowerCase()}:${decoded.standard}`;
        const accum =
          nfts.get(key) ??
          (() => {
            const a: NftAccum = {
              contract: decoded.contract,
              standard: decoded.standard,
              wallets: new Set(),
              tokenIds: new Set(),
            };
            nfts.set(key, a);
            return a;
          })();
        accum.wallets.add(wallet.toLowerCase());
        const ids = decoded.standard === "erc721" ? [decoded.tokenId] : decoded.ids;
        for (const id of ids) {
          if (accum.tokenIds.size >= this.limits.maxTokenIdsPerCollection) {
            anySourceIncomplete = true;
            break;
          }
          accum.tokenIds.add(id);
        }
      }
    }

    const walletsFor = (set: Set<string>): PortfolioAddress[] =>
      normalisedWallets.filter((w) => set.has(w.toLowerCase()));

    // Materialise with caps.
    let capped = false;
    const fungibleList: FungibleCandidate[] = [...fungibles.values()]
      .slice(0, this.limits.maxFungibleCandidates)
      .map((e) => ({ ...e.c, wallets: walletsFor(e.wallets) }));
    if (fungibles.size > this.limits.maxFungibleCandidates) capped = true;

    const nftList: NftCandidate[] = [...nfts.values()].slice(0, this.limits.maxNftCandidates).map((a) => ({
      chainId: MONAD_CHAIN_ID,
      contractAddress: a.contract,
      standard: a.standard,
      wallets: walletsFor(a.wallets),
      tokenIds: [...a.tokenIds],
      source: "envio",
    }));
    if (nfts.size > this.limits.maxNftCandidates) capped = true;

    if (capped) {
      failures.push({
        scope: "pagination",
        reason: "Candidate limit reached; discovery is a lower bound.",
        blocked: false,
      });
    }

    const status: DiscoveryStatus =
      blockedWallets === normalisedWallets.length && normalisedWallets.length > 0
        ? "unavailable"
        : failures.length > 0 || anySourceIncomplete || capped
          ? "partial"
          : "complete";

    return {
      fungibles: fungibleList,
      nfts: nftList,
      status,
      failures,
      context: { provider: this.name, scannedToBlock, archiveHeight },
      candidatesConsidered: fungibles.size + nfts.size,
    };
  }
}
