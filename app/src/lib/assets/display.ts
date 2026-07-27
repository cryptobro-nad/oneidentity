/**
 * Presentation helpers for discovered fungible holdings.
 *
 * Pure and framework-free so the grouping rules are unit-tested without a DOM.
 * Turns the flat per-(wallet, contract) discovery response into a per-contract
 * ownership matrix and sorts each contract into one of three honest buckets:
 *
 *   recognized — on the curated allowlist (verification === curated-allowlist)
 *   spam       — NOT recognized AND the name/symbol carries a lure signal
 *   other      — everything else (held, unknown; shown, never hidden)
 *
 * A recognized token is never spam: the allowlist always wins. A failed balance
 * read is preserved as a failed cell, never folded into a zero.
 */

import { isLikelyNftSpam } from "@/lib/nftSpam";
import type { Classification, DiscoveryStatus, PartialFailure } from "./types";

/** Wire shape of one discovered ERC-20 holding (bigints as decimal strings). */
export type WireFungibleHolding = {
  chainId: number;
  wallet: string;
  contractAddress: string;
  standard: "erc20";
  raw: string;
  decimals: number;
  symbol: string | null;
  name: string | null;
  metadataQuality: string;
  classification: Classification;
  verification: string;
  discoverySource: string;
  incomplete: boolean;
};

/** The discovered-fungibles block attached to a portfolio response. */
export type WireDiscoveredFungibles = {
  tokens: WireFungibleHolding[];
  failures: PartialFailure[];
  status: DiscoveryStatus;
  /** Provider whose candidates were used: "envio" | "curated". */
  source: string;
  blockNumber: string;
};

export type Bucket = "recognized" | "other" | "spam";

export type FungibleCell = {
  wallet: string;
  /** Verified balance; null only when the read failed. Zero is a real zero. */
  raw: bigint | null;
  failed: boolean;
  error?: string;
};

export type FungibleRow = {
  contractAddress: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  classification: Classification;
  bucket: Bucket;
  /** Sum of successful reads only. */
  total: bigint;
  /** A metadata read failed somewhere; the balance is still trustworthy. */
  incomplete: boolean;
  /** One cell per wallet, in the given wallet order. */
  cells: FungibleCell[];
};

export type GroupedFungibles = {
  recognized: FungibleRow[];
  other: FungibleRow[];
  spam: FungibleRow[];
};

/** Which bucket a token belongs in. Recognized always wins over the lure check. */
export function bucketFor(
  classification: Classification,
  name: string | null,
  symbol: string | null,
): Bucket {
  if (classification === "recognized") return "recognized";
  if (isLikelyNftSpam(name ?? symbol)) return "spam";
  return "other";
}

const byTotalDesc = (a: FungibleRow, b: FungibleRow) =>
  b.total > a.total ? 1 : b.total < a.total ? -1 : 0;

/**
 * Pivots discovery holdings + failures into per-contract rows keyed to the given
 * wallet order, then splits them into recognized / other / spam.
 *
 * A wallet with no holding and no failure for a shown contract is a genuine
 * zero (verification drops successful zeroes), rendered as a muted 0.
 */
export function groupFungibles(
  tokens: readonly WireFungibleHolding[],
  failures: readonly PartialFailure[],
  wallets: readonly string[],
): GroupedFungibles {
  const order = wallets.map((w) => w.toLowerCase());
  const rows = new Map<string, FungibleRow>();

  const blankCells = (): FungibleCell[] =>
    order.map((w) => ({ wallet: w, raw: 0n, failed: false }));

  const ensure = (contract: string): FungibleRow => {
    const key = contract.toLowerCase();
    let row = rows.get(key);
    if (!row) {
      row = {
        contractAddress: contract,
        symbol: null,
        name: null,
        decimals: 18,
        classification: "other",
        bucket: "other",
        total: 0n,
        incomplete: false,
        cells: blankCells(),
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const h of tokens) {
    const row = ensure(h.contractAddress);
    // Metadata is per-contract; take it from any holding that carries it.
    row.symbol = h.symbol ?? row.symbol;
    row.name = h.name ?? row.name;
    row.decimals = h.decimals;
    row.classification = h.classification;
    row.incomplete = row.incomplete || h.incomplete;
    const raw = BigInt(h.raw);
    row.total += raw;
    const ci = order.indexOf(h.wallet.toLowerCase());
    if (ci >= 0) row.cells[ci] = { wallet: order[ci]!, raw, failed: false };
  }

  for (const f of failures) {
    if (f.scope !== "contract" || !f.contract) continue;
    const row = ensure(f.contract);
    if (f.wallet) {
      const ci = order.indexOf(f.wallet.toLowerCase());
      if (ci >= 0) row.cells[ci] = { wallet: order[ci]!, raw: null, failed: true, error: f.reason };
    }
  }

  const grouped: GroupedFungibles = { recognized: [], other: [], spam: [] };
  for (const row of rows.values()) {
    row.bucket = bucketFor(row.classification, row.name, row.symbol);
    grouped[row.bucket].push(row);
  }
  grouped.recognized.sort(byTotalDesc);
  grouped.other.sort(byTotalDesc);
  grouped.spam.sort(byTotalDesc);
  return grouped;
}

/**
 * True only when dynamic discovery was attempted and failed, so results came
 * from the curated fallback. A deployment that simply never enabled dynamic
 * discovery is NOT flagged — it is showing known tokens, not degraded coverage.
 */
export function usedCuratedFallback(source: string, failures: readonly PartialFailure[]): boolean {
  return (
    source === "curated" &&
    failures.some((f) => f.scope === "provider" && /fallback|unavailable/i.test(f.reason))
  );
}
