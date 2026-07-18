/**
 * Serialisation across the Server Action boundary.
 *
 * `bigint` does not survive the RSC wire format reliably, so the domain types
 * are converted to explicit decimal strings here and rebuilt on the client.
 * Doing this in one place keeps `lib/portfolio.ts` free to model amounts as
 * bigint, which is the only correct type for on-chain values.
 */

import type {
  AggregatedPortfolio,
  AssetReadResult,
  NftCollectionCheck,
  PortfolioAddress,
} from "./types";

export type WireAssetRead = {
  success: boolean;
  rawValue?: string;
  error?: string;
};

export type WireWallet = {
  address: PortfolioAddress;
  mon: WireAssetRead;
  stablecoins: Record<string, WireAssetRead>;
};

export type WirePortfolio = {
  wallets: WireWallet[];
  totals: Record<string, string>;
  blockNumber: string;
  partial: boolean;
  endpointUsed: string;
  failedEndpoints: { url: string; error: string }[];
  fetchedAt: number;
};

export type WireNftCheck =
  | { status: "not-a-contract"; address: PortfolioAddress }
  | { status: "not-erc721"; address: PortfolioAddress }
  | {
      status: "ok";
      address: PortfolioAddress;
      wallets: { address: PortfolioAddress; result: WireAssetRead }[];
      total: string;
      partial: boolean;
      blockNumber: string;
      endpointUsed: string;
      checkedAt: number;
    };

/** Result envelope for actions, so a total failure is data rather than a throw. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const encodeRead = (r: AssetReadResult): WireAssetRead => ({
  success: r.success,
  ...(r.rawValue !== undefined ? { rawValue: r.rawValue.toString() } : {}),
  ...(r.error !== undefined ? { error: r.error } : {}),
});

const decodeRead = (r: WireAssetRead): AssetReadResult => ({
  success: r.success,
  ...(r.rawValue !== undefined ? { rawValue: BigInt(r.rawValue) } : {}),
  ...(r.error !== undefined ? { error: r.error } : {}),
});

export function encodePortfolio(p: AggregatedPortfolio): WirePortfolio {
  return {
    wallets: p.wallets.map((w) => ({
      address: w.address,
      mon: encodeRead(w.mon),
      stablecoins: Object.fromEntries(
        Object.entries(w.stablecoins).map(([symbol, r]) => [symbol, encodeRead(r)]),
      ),
    })),
    totals: Object.fromEntries(
      Object.entries(p.totals).map(([symbol, v]) => [symbol, v.toString()]),
    ),
    blockNumber: p.blockNumber.toString(),
    partial: p.partial,
    endpointUsed: p.endpointUsed,
    failedEndpoints: p.failedEndpoints,
    fetchedAt: p.fetchedAt,
  };
}

export function decodePortfolio(w: WirePortfolio): AggregatedPortfolio {
  return {
    wallets: w.wallets.map((wallet) => ({
      address: wallet.address,
      mon: decodeRead(wallet.mon),
      stablecoins: Object.fromEntries(
        Object.entries(wallet.stablecoins).map(([symbol, r]) => [symbol, decodeRead(r)]),
      ),
    })),
    totals: Object.fromEntries(
      Object.entries(w.totals).map(([symbol, v]) => [symbol, BigInt(v)]),
    ),
    blockNumber: BigInt(w.blockNumber),
    partial: w.partial,
    endpointUsed: w.endpointUsed,
    failedEndpoints: w.failedEndpoints,
    fetchedAt: w.fetchedAt,
  };
}

export function encodeNftCheck(c: NftCollectionCheck): WireNftCheck {
  if (c.status !== "ok") return c;
  return {
    status: "ok",
    address: c.address,
    wallets: c.wallets.map((w) => ({ address: w.address, result: encodeRead(w.result) })),
    total: c.total.toString(),
    partial: c.partial,
    blockNumber: c.blockNumber.toString(),
    endpointUsed: c.endpointUsed,
    checkedAt: c.checkedAt,
  };
}

export function decodeNftCheck(w: WireNftCheck): NftCollectionCheck {
  if (w.status !== "ok") return w;
  return {
    status: "ok",
    address: w.address,
    wallets: w.wallets.map((x) => ({ address: x.address, result: decodeRead(x.result) })),
    total: BigInt(w.total),
    partial: w.partial,
    blockNumber: BigInt(w.blockNumber),
    endpointUsed: w.endpointUsed,
    checkedAt: w.checkedAt,
  };
}
