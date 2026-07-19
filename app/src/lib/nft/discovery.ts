/**
 * NFT collection discovery.
 *
 * ## Why a provider interface rather than a direct call
 *
 * Discovery is the one thing that cannot be done from an RPC node alone.
 * Finding which collections a wallet holds requires scanning the whole chain's
 * Transfer history, and Monad's public RPC caps `eth_getLogs` at 100 blocks
 * (measured in spikes/mainnet-data). At ~0.5s blocks that is under a minute of
 * history per request, so a full scan is not feasible client-side.
 *
 * An indexer is therefore required for discovery — but never for truth. What an
 * indexer returns is treated strictly as a *candidate list*; the balances shown
 * to the user always come from an on-chain `balanceOf` via Multicall3. That
 * keeps a stale or wrong index from ever producing a wrong number.
 */

import type { PortfolioAddress } from "@/lib/types";
import { MONAD_CHAIN_ID } from "@/lib/chain";

/** A collection an indexer believes a wallet holds. Unverified until checked. */
export type DiscoveredCollection = {
  chainId: typeof MONAD_CHAIN_ID;
  contractAddress: PortfolioAddress;
  /** Indexer-supplied display name. May be null; never trusted for identity. */
  name: string | null;
  /** Indexer's claimed quantity. Shown only as provenance, never as the count. */
  claimedQty: number | null;
};

/** Why discovery could not run, when it could not. */
export type DiscoveryBlockReason = "no-key" | "tier-required" | "rate-limited" | "error";

export type DiscoveryOutcome =
  | { ok: true; wallet: PortfolioAddress; collections: DiscoveredCollection[] }
  | {
      ok: false;
      wallet: PortfolioAddress;
      error: string;
      blocked: boolean;
      /** Distinguishes "needs a paid plan" from "transient failure". */
      reason: DiscoveryBlockReason;
    };

export interface NftDiscoveryProvider {
  readonly name: string;
  /** True when the provider has the credentials it needs to actually run. */
  readonly configured: boolean;
  /** Exact command to reproduce a call, for when the provider is blocked. */
  reproduceCommand(wallet: PortfolioAddress): string;
  discover(wallet: PortfolioAddress): Promise<DiscoveryOutcome>;
}

// ---------------------------------------------------------------------------
// BlockVision
// ---------------------------------------------------------------------------

export const BLOCKVISION_NFT_ENDPOINT =
  "https://api.blockvision.org/v2/monad/account/nfts";

/**
 * BlockVision Monad Indexing API — "Retrieve Account's NFTs".
 *
 * Documented at docs.blockvision.org; supports Monad Mainnet, returns
 * contractAddress / name / tokenId / qty, and paginates 5 collections per page.
 * Requires an API key. One wallet per request — there is no documented bulk
 * form, so N wallets cost N request chains.
 *
 * Auth header: **`x-api-key`**, confirmed empirically against the live API.
 * With `x-api-key` the API returns a *tier* error (proving the key
 * authenticated); with `apikey`, `Authorization: Bearer`, or a query parameter
 * it returns "apikey must" (missing credential). Case-insensitive.
 */
export const BLOCKVISION_AUTH_HEADER = "x-api-key";

/**
 * "This endpoint needs a higher tier."
 *
 * Measured 2026-07-19 with a valid free-tier key:
 *
 *   /v2/monad/account/nfts    -> 403 code -32609
 *     "Your 30 trial requests have been used. The Monad Mainnet Indexing API
 *      is available only to Pro-tier users."
 *   /v2/monad/account/tokens  -> 403 code -32609 (same)
 *   /v2/monad/contract/detail -> 200 code 0 OK   (key valid; not gated)
 *
 * The Monad Mainnet *account indexing* endpoints — the ones that enumerate a
 * wallet's NFTs — sit behind the Pro plan after 30 trial calls. The generic
 * "10M CU free tier" on the pricing page does not cover them.
 *
 * Tracked as its own state so the UI can say "discovery requires a paid plan"
 * instead of the misleading "no NFTs found".
 */
export const BLOCKVISION_TIER_ERROR_CODE = -32609;
/** Missing or unrecognised credential. */
export const BLOCKVISION_NO_KEY_ERROR_CODE = -32002;

type BlockVisionItem = {
  name?: string;
  contractAddress?: string;
  tokenId?: string;
  qty?: number | string;
  ercStandard?: string;
};

type BlockVisionResponse = {
  code?: number;
  message?: string;
  reason?: string;
  result?: {
    data?: BlockVisionItem[];
    total?: number;
    nextPageIndex?: number | null;
    collectionTotal?: number;
  };
};

export class BlockVisionDiscovery implements NftDiscoveryProvider {
  readonly name = "blockvision";

  constructor(
    private readonly apiKey: string | undefined,
    private readonly maxPages = 20,
    private readonly timeoutMs = 12_000,
  ) {}

  get configured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  reproduceCommand(wallet: PortfolioAddress): string {
    return `curl -H "${BLOCKVISION_AUTH_HEADER}: $BLOCKVISION_API_KEY" "${BLOCKVISION_NFT_ENDPOINT}?address=${wallet}&pageIndex=1"`;
  }

  async discover(wallet: PortfolioAddress): Promise<DiscoveryOutcome> {
    if (!this.configured) {
      return {
        ok: false,
        wallet,
        error: "BLOCKVISION_API_KEY is not set.",
        blocked: true,
        reason: "no-key",
      };
    }

    const byAddress = new Map<string, DiscoveredCollection>();

    try {
      let pageIndex: number | null = 1;
      let pages = 0;

      // Paginate to exhaustion. The docs return 5 collections per page, so a
      // wallet with many collections needs several round trips; the cap stops
      // a malformed nextPageIndex from looping forever.
      while (pageIndex !== null && pages < this.maxPages) {
        const url = `${BLOCKVISION_NFT_ENDPOINT}?address=${wallet}&pageIndex=${pageIndex}`;

        // Bound every call: a hung indexer must not hang the whole page.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let res: Response;
        try {
          res = await fetch(url, {
            headers: { [BLOCKVISION_AUTH_HEADER]: this.apiKey!, accept: "application/json" },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        // Parse the body even on a non-2xx: BlockVision returns 403 with a
        // machine-readable code that distinguishes "wrong tier" from "no key".
        const text = await res.text();
        let json: BlockVisionResponse = {};
        try {
          json = JSON.parse(text) as BlockVisionResponse;
        } catch {
          json = {};
        }

        const code = json.code;
        const message = json.message ?? json.reason ?? `HTTP ${res.status} from BlockVision`;

        if (code === BLOCKVISION_TIER_ERROR_CODE) {
          return { ok: false, wallet, error: message, blocked: true, reason: "tier-required" };
        }
        if (code === BLOCKVISION_NO_KEY_ERROR_CODE) {
          return { ok: false, wallet, error: message, blocked: true, reason: "no-key" };
        }
        if (res.status === 429) {
          return { ok: false, wallet, error: message, blocked: false, reason: "rate-limited" };
        }
        if (!res.ok) {
          return {
            ok: false,
            wallet,
            error: message,
            blocked: res.status === 401 || res.status === 403,
            reason: "error",
          };
        }
        if (typeof code === "number" && code !== 0 && code !== 200) {
          return { ok: false, wallet, error: message, blocked: false, reason: "error" };
        }

        for (const item of json.result?.data ?? []) {
          if (!item.contractAddress) continue;
          // ERC-1155 is explicitly out of scope: ONEIdentity only aggregates
          // ERC-721 balanceOf, so counting 1155s would be unverifiable.
          if (item.ercStandard && !/721/.test(item.ercStandard)) continue;

          const key = item.contractAddress.toLowerCase();
          const existing = byAddress.get(key);
          const qty = Number(item.qty ?? 1);

          if (existing) {
            existing.claimedQty = (existing.claimedQty ?? 0) + (Number.isFinite(qty) ? qty : 0);
          } else {
            byAddress.set(key, {
              chainId: MONAD_CHAIN_ID,
              contractAddress: item.contractAddress as PortfolioAddress,
              name: item.name && item.name.length > 0 ? item.name : null,
              claimedQty: Number.isFinite(qty) ? qty : null,
            });
          }
        }

        const next = json.result?.nextPageIndex ?? null;
        pageIndex = typeof next === "number" && next > 0 ? next : null;
        pages++;
      }

      return { ok: true, wallet, collections: [...byAddress.values()] };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        wallet,
        error: aborted
          ? `BlockVision did not respond within ${this.timeoutMs}ms`
          : error instanceof Error
            ? error.message.split("\n")[0]!
            : String(error),
        blocked: false,
        reason: "error",
      };
    }
  }
}

/**
 * A curated fallback list used when no indexer is configured.
 *
 * These are collections observed on Monad Mainnet during the data spike. It is
 * deliberately small and explicitly NOT a discovery mechanism — it cannot find
 * a collection nobody added. Verification still runs on-chain, so a wrong entry
 * shows a real zero rather than a wrong number.
 */
export const CURATED_COLLECTIONS: DiscoveredCollection[] = [
  {
    chainId: MONAD_CHAIN_ID,
    contractAddress: "0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC",
    name: "Clober Orderbook Maker Order",
    claimedQty: null,
  },
  {
    chainId: MONAD_CHAIN_ID,
    contractAddress: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
    name: "Pancake V3 Positions NFT-V1",
    claimedQty: null,
  },
  {
    chainId: MONAD_CHAIN_ID,
    contractAddress: "0x5b7eC4a94fF9beDb700fb82aB09d5846972F4016",
    name: "Uniswap v4 Positions NFT",
    claimedQty: null,
  },
];

export class CuratedDiscovery implements NftDiscoveryProvider {
  readonly name = "curated";
  readonly configured = true;

  constructor(private readonly collections = CURATED_COLLECTIONS) {}

  reproduceCommand(): string {
    return "(built-in curated list — no network call)";
  }

  async discover(wallet: PortfolioAddress): Promise<DiscoveryOutcome> {
    return { ok: true, wallet, collections: this.collections };
  }
}
