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

export type DiscoveryOutcome =
  | { ok: true; wallet: PortfolioAddress; collections: DiscoveredCollection[] }
  | { ok: false; wallet: PortfolioAddress; error: string; blocked: boolean };

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
 * Auth header: `x-api-key` is used here. BlockVision's docs render their code
 * samples client-side so the header name could not be confirmed from the
 * published reference; if a key returns 401/403, check the dashboard's sample
 * and adjust this one constant.
 */
export const BLOCKVISION_AUTH_HEADER = "x-api-key";

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
        const res = await fetch(url, {
          headers: { [BLOCKVISION_AUTH_HEADER]: this.apiKey! },
        });

        if (!res.ok) {
          return {
            ok: false,
            wallet,
            error: `HTTP ${res.status} from BlockVision`,
            blocked: res.status === 401 || res.status === 403,
          };
        }

        const json = (await res.json()) as BlockVisionResponse;
        if (typeof json.code === "number" && json.code !== 0 && json.code !== 200) {
          return {
            ok: false,
            wallet,
            error: json.message ?? json.reason ?? `BlockVision code ${json.code}`,
            blocked: false,
          };
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
      return {
        ok: false,
        wallet,
        error: error instanceof Error ? error.message.split("\n")[0]! : String(error),
        blocked: false,
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
