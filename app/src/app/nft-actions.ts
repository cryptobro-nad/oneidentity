"use server";

/**
 * NFT holdings server action.
 *
 * This is the ONLY place `BLOCKVISION_API_KEY` is read. It has no
 * `NEXT_PUBLIC_` prefix, so Next.js never inlines it into a client bundle, and
 * every BlockVision request originates here on the server. The key is never
 * returned to the browser in any form — not in results, not in error strings.
 *
 * No caching is applied: BlockVision's terms are silent on caching, so nothing
 * is stored until that is clarified.
 */

import { getAddress } from "viem";
import { withRpcFallback } from "@/lib/rpc";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import {
  BlockVisionDiscovery,
  CuratedDiscovery,
  type DiscoveredCollection,
  type DiscoveryBlockReason,
} from "@/lib/nft/discovery";
import { OnChainLogDiscovery } from "@/lib/nft/onchainDiscovery";
import { loadHybridNftHoldings } from "@/lib/nft/hybrid";
import type { PortfolioAddress } from "@/lib/types";

export type WireWalletCount = {
  wallet: PortfolioAddress;
  /** Decimal string, or null when the read failed — never conflated with "0". */
  count: string | null;
  error?: string;
};

export type WireCollection = {
  chainId: typeof MONAD_CHAIN_ID;
  contractAddress: PortfolioAddress;
  name: string | null;
  nameSource: "onchain" | "indexer" | "none";
  total: string;
  perWallet: WireWalletCount[];
  partial: boolean;
  isErc721: boolean;
};

export type NftHoldingsResult =
  | {
      ok: true;
      collections: WireCollection[];
      blockNumber: string;
      /** How discovery went, so the UI can be precise about completeness. */
      discovery:
        | { state: "complete"; provider: string }
        | { state: "unavailable"; provider: string; reason: DiscoveryBlockReason; message: string }
        | { state: "partial"; provider: string; failedWallets: PortfolioAddress[]; message: string };
      verificationPartial: boolean;
      candidatesConsidered: number;
    }
  | { ok: false; error: string };

/**
 * Loads combined NFT holdings for a set of wallets.
 *
 * Discovery uses BlockVision when a key is configured; otherwise it falls back
 * to the curated list. Either way, every count is re-read on-chain — the
 * indexer only ever proposes candidates.
 */
export async function loadNftHoldingsAction(
  addresses: string[],
  extraCollections: string[] = [],
): Promise<NftHoldingsResult> {
  const wallets: PortfolioAddress[] = [];
  for (const raw of addresses) {
    try {
      wallets.push(getAddress(raw) as PortfolioAddress);
    } catch {
      return { ok: false, error: `Invalid wallet address: ${raw}` };
    }
  }
  if (wallets.length === 0) return { ok: false, error: "No wallet addresses provided." };

  const extras: DiscoveredCollection[] = [];
  for (const raw of extraCollections) {
    try {
      extras.push({
        chainId: MONAD_CHAIN_ID,
        contractAddress: getAddress(raw) as PortfolioAddress,
        name: null,
        claimedQty: null,
      });
    } catch {
      // A malformed manual entry is ignored rather than failing the whole load.
    }
  }

  // Provider selection.
  //
  // Default is the self-indexed on-chain log scan: it needs no credential, no
  // paid plan, and is verifiable end to end. A commercial indexer is used only
  // when one is explicitly configured AND opted into, since BlockVision's
  // Monad account endpoints are Pro-tier gated and would otherwise fail every
  // request. The curated list remains as a last resort.
  const apiKey = process.env.BLOCKVISION_API_KEY;
  const preferIndexer = process.env.NFT_DISCOVERY_PROVIDER === "blockvision";

  const provider =
    preferIndexer && apiKey
      ? new BlockVisionDiscovery(apiKey)
      : process.env.NFT_DISCOVERY_PROVIDER === "curated"
        ? new CuratedDiscovery()
        : new OnChainLogDiscovery();

  try {
    const outcome = await withRpcFallback((client) =>
      loadHybridNftHoldings(client, wallets, provider, { extraCollections: extras }),
    );
    const result = outcome.value;

    // Collapse per-wallet discovery failures into one honest status.
    let discovery: Extract<NftHoldingsResult, { ok: true }>["discovery"];
    if (result.discoveryFailures.length === 0) {
      discovery = { state: "complete", provider: result.providerName };
    } else if (result.discoveryFailures.length === wallets.length) {
      // Every wallet failed the same way — discovery is simply unavailable.
      const first = result.discoveryFailures[0]!;
      discovery = {
        state: "unavailable",
        provider: result.providerName,
        reason: first.reason,
        message: first.error,
      };
    } else {
      discovery = {
        state: "partial",
        provider: result.providerName,
        failedWallets: result.discoveryFailures.map((f) => f.wallet),
        message: result.discoveryFailures[0]!.error,
      };
    }

    return {
      ok: true,
      collections: result.collections.map((c) => ({
        chainId: c.chainId,
        contractAddress: c.contractAddress,
        name: c.name,
        nameSource: c.nameSource,
        total: c.total.toString(),
        perWallet: c.perWallet.map((w) => ({
          wallet: w.wallet,
          count: w.count === null ? null : w.count.toString(),
          ...(w.error ? { error: w.error } : {}),
        })),
        partial: c.partial,
        isErc721: c.isErc721,
      })),
      blockNumber: result.blockNumber.toString(),
      discovery,
      verificationPartial: result.verificationPartial,
      candidatesConsidered: result.candidatesConsidered,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.split("\n")[0]! : String(error),
    };
  }
}
