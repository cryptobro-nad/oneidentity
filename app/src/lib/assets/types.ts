/**
 * Normalized asset-discovery types.
 *
 * The UI and portfolio aggregation depend ONLY on these types, never on a raw
 * provider (Envio, curated, on-chain log scan) response. That boundary is what
 * lets the discovery provider be swapped by a server-side feature flag without
 * touching a single component.
 *
 * Two layers live here:
 *   1. Candidates — what a discovery provider *proposes* a wallet may hold.
 *      Never trusted for balances; only contract addresses + standard.
 *   2. Holdings — the *verified* result after RPC re-reads balances on-chain.
 *      Fungibles are keyed by contract address, never by symbol.
 *
 * Nothing in this file performs I/O.
 */

import { MONAD_CHAIN_ID } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";

export const ASSET_CHAIN_ID = MONAD_CHAIN_ID;

/** Token standards ONE understands. `native` is MON and is never an ERC-20. */
export type AssetStandard = "native" | "erc20" | "erc721" | "erc1155";

/** How much metadata we actually have, so the UI can be honest about gaps. */
export type MetadataQuality = "onchain" | "partial" | "missing";

/**
 * Where a "recognized" judgement comes from. Envio supplies NONE — it never
 * asserts an asset is safe — so discovery-sourced assets are `unknown` unless
 * they match a curated allowlist.
 */
export type VerificationSource = "curated-allowlist" | "onchain-metadata" | "unknown";

/** Truthful buckets. `spam` requires an explicit, conservative rule — never
 *  merely "unverified". */
export type Classification = "recognized" | "other" | "spam";

/** Which provider proposed a candidate. */
export type DiscoverySource = "envio" | "curated" | "onchain-log" | "manual";

/** Block / index provenance, where the provider supplies it. */
export type IndexedContext = {
  provider: string;
  /** Block the RPC verification was pinned to (set during verification). */
  verifiedAtBlock?: bigint;
  /** Highest block discovery actually scanned to. */
  scannedToBlock?: bigint;
  /** Provider archive height at query time, if known. */
  archiveHeight?: bigint;
};

export type PartialFailureScope = "provider" | "wallet" | "contract" | "pagination";

/** One honest failure. `blocked` marks a hard stop (no token/limit) vs transient. */
export type PartialFailure = {
  scope: PartialFailureScope;
  wallet?: PortfolioAddress;
  contract?: PortfolioAddress;
  reason: string;
  blocked: boolean;
};

/**
 * Overall discovery completeness.
 *   complete    — the provider reached the required history for every wallet
 *   partial     — some wallets/pages were capped; results are a lower bound
 *   unavailable — the provider could not run at all (fall back to curated)
 */
export type DiscoveryStatus = "complete" | "partial" | "unavailable";

// ---------------------------------------------------------------------------
// Candidates (pre-verification) — contracts a wallet MIGHT hold
// ---------------------------------------------------------------------------

export type FungibleCandidate = {
  chainId: typeof MONAD_CHAIN_ID;
  contractAddress: PortfolioAddress;
  standard: "erc20";
  /** Wallets for which this contract was seen in a Transfer. Deduped, checksummed. */
  wallets: PortfolioAddress[];
  source: DiscoverySource;
};

export type NftCandidate = {
  chainId: typeof MONAD_CHAIN_ID;
  contractAddress: PortfolioAddress;
  standard: "erc721" | "erc1155";
  wallets: PortfolioAddress[];
  /** Token ids seen for this wallet-set (decimal strings). Capped; may be partial. */
  tokenIds: string[];
  source: DiscoverySource;
};

export type DiscoveryResult = {
  fungibles: FungibleCandidate[];
  nfts: NftCandidate[];
  status: DiscoveryStatus;
  failures: PartialFailure[];
  context: IndexedContext;
  /** Distinct candidate contracts proposed, before verification. */
  candidatesConsidered: number;
};

// ---------------------------------------------------------------------------
// Holdings (post RPC verification) — the shape the UI consumes
// ---------------------------------------------------------------------------

/** Native MON. Always verified on-chain; never represented as an ERC-20. */
export type NativeBalance = {
  chainId: typeof MONAD_CHAIN_ID;
  wallet: PortfolioAddress;
  raw: bigint;
  decimals: 18;
};

/**
 * One wallet's holding of one ERC-20, keyed by contract address.
 *
 * `symbol`/`decimals`/`name` come from ON-CHAIN reads during verification, never
 * from logs or an indexer. Two contracts with the same symbol stay separate
 * because the identity is `chainId:contractAddress`, computed by `holdingKey`.
 */
export type FungibleHolding = {
  chainId: typeof MONAD_CHAIN_ID;
  wallet: PortfolioAddress;
  contractAddress: PortfolioAddress;
  standard: "erc20";
  raw: bigint;
  /** On-chain decimals; falls back to 18 only when the read failed (flagged incomplete). */
  decimals: number;
  symbol: string | null;
  name: string | null;
  metadataQuality: MetadataQuality;
  classification: Classification;
  verification: VerificationSource;
  discoverySource: DiscoverySource;
  /** True when a metadata read failed; the balance is still trustworthy. */
  incomplete: boolean;
};

export type NftItemHolding = {
  chainId: typeof MONAD_CHAIN_ID;
  wallet: PortfolioAddress;
  contractAddress: PortfolioAddress;
  standard: "erc721" | "erc1155";
  tokenId: string;
  /** Always 1 for a held ERC-721; the on-chain balanceOf(wallet,id) for ERC-1155. */
  quantity: bigint;
  metadataQuality: MetadataQuality;
};

export type NftCollectionHolding = {
  chainId: typeof MONAD_CHAIN_ID;
  contractAddress: PortfolioAddress;
  standard: "erc721" | "erc1155";
  name: string | null;
  metadataQuality: MetadataQuality;
  classification: Classification;
  discoverySource: DiscoverySource;
  /** Sum of successful per-wallet reads only. */
  total: bigint;
  perWallet: { wallet: PortfolioAddress; count: bigint | null; error?: string }[];
  /** ERC-1155 items when enumerated; ERC-721 rows optional. */
  items?: NftItemHolding[];
  partial: boolean;
};

/** Stable identity for a fungible holding: chain + contract, never symbol. */
export function holdingKey(chainId: number, contractAddress: string): string {
  return `${chainId}:${contractAddress.toLowerCase()}`;
}

/** Stable identity for an NFT item: contract + tokenId + standard. */
export function nftItemKey(contractAddress: string, tokenId: string, standard: string): string {
  return `${contractAddress.toLowerCase()}:${tokenId}:${standard}`;
}
