/**
 * Balance and NFT aggregation across up to five wallets.
 *
 * Core rule, mirrored from ONEIdentity.sol: a failed read is never silently
 * folded into the total as zero. Every per-wallet, per-token result is either
 * an explicit `ok` value or an explicit `error`, and any total derived from an
 * incomplete set is flagged `partial`.
 */

import {
  erc20Abi,
  formatUnits,
  getAddress,
  type Address,
  type PublicClient,
} from "viem";
import type { SupportedStablecoin } from "./stablecoins.js";
import type { WalletNft } from "./nft-provider.js";

export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type NativeBalanceRow = {
  wallet: Address;
  result: Outcome<string>;
};

export type TokenBalanceRow = {
  wallet: Address;
  token: Address;
  symbol: string;
  decimals: number;
  result: Outcome<string>;
};

export type BalanceSnapshot = {
  blockNumber: string;
  method: "individual" | "multicall3";
  elapsedMs: number;
  native: NativeBalanceRow[];
  tokens: TokenBalanceRow[];
  /** True if any read failed — totals below cover only the successful reads. */
  partial: boolean;
  totals: {
    nativeWei: string;
    nativeFormatted: string;
    perToken: Array<{
      token: Address;
      symbol: string;
      decimals: number;
      raw: string;
      formatted: string;
      /** Wallets whose balance could not be read for this token. */
      failedWallets: Address[];
    }>;
  };
};

const errText = (err: unknown): string =>
  err instanceof Error ? err.message.split("\n")[0]! : String(err);

function summarise(
  native: NativeBalanceRow[],
  tokens: TokenBalanceRow[],
  stablecoins: SupportedStablecoin[],
): BalanceSnapshot["totals"] & { partial: boolean } {
  let nativeTotal = 0n;
  let partial = false;
  for (const row of native) {
    if (row.result.ok) nativeTotal += BigInt(row.result.value);
    else partial = true;
  }

  const perToken = stablecoins.map((sc) => {
    const address = getAddress(sc.address);
    const rows = tokens.filter((t) => t.token === address);
    let raw = 0n;
    const failedWallets: Address[] = [];
    for (const row of rows) {
      if (row.result.ok) raw += BigInt(row.result.value);
      else {
        failedWallets.push(row.wallet);
        partial = true;
      }
    }
    return {
      token: address,
      symbol: sc.symbol,
      decimals: sc.decimals,
      raw: raw.toString(),
      formatted: formatUnits(raw, sc.decimals),
      failedWallets,
    };
  });

  return {
    nativeWei: nativeTotal.toString(),
    nativeFormatted: formatUnits(nativeTotal, 18),
    perToken,
    partial,
  };
}

/** One RPC round-trip per read. The baseline both for correctness and latency. */
export async function fetchBalancesIndividually(
  client: PublicClient,
  wallets: Address[],
  stablecoins: SupportedStablecoin[],
  blockNumber: bigint,
): Promise<BalanceSnapshot> {
  const started = performance.now();

  const native: NativeBalanceRow[] = [];
  for (const wallet of wallets) {
    try {
      const bal = await client.getBalance({ address: wallet, blockNumber });
      native.push({ wallet, result: { ok: true, value: bal.toString() } });
    } catch (err) {
      native.push({ wallet, result: { ok: false, error: errText(err) } });
    }
  }

  const tokens: TokenBalanceRow[] = [];
  for (const sc of stablecoins) {
    const token = getAddress(sc.address);
    for (const wallet of wallets) {
      try {
        const bal = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
          blockNumber,
        });
        tokens.push({
          wallet,
          token,
          symbol: sc.symbol,
          decimals: sc.decimals,
          result: { ok: true, value: (bal as bigint).toString() },
        });
      } catch (err) {
        tokens.push({
          wallet,
          token,
          symbol: sc.symbol,
          decimals: sc.decimals,
          result: { ok: false, error: errText(err) },
        });
      }
    }
  }

  const { partial, ...totals } = summarise(native, tokens, stablecoins);
  return {
    blockNumber: blockNumber.toString(),
    method: "individual",
    elapsedMs: Math.round(performance.now() - started),
    native,
    tokens,
    partial,
    totals,
  };
}

/**
 * Same reads via Multicall3, pinned to the same block so the two methods are
 * directly comparable. `allowFailure` keeps a single bad token from destroying
 * the batch while still surfacing which call failed.
 */
export async function fetchBalancesViaMulticall(
  client: PublicClient,
  wallets: Address[],
  stablecoins: SupportedStablecoin[],
  blockNumber: bigint,
): Promise<BalanceSnapshot> {
  const started = performance.now();

  const contracts = stablecoins.flatMap((sc) =>
    wallets.map((wallet) => ({
      address: getAddress(sc.address),
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [wallet] as const,
    })),
  );

  const [nativeResults, tokenResults] = await Promise.all([
    // Native balance has no Multicall3 aggregate path in viem's helper, so these
    // ride the transport's JSON-RPC batching instead.
    Promise.all(
      wallets.map(async (wallet): Promise<NativeBalanceRow> => {
        try {
          const bal = await client.getBalance({ address: wallet, blockNumber });
          return { wallet, result: { ok: true, value: bal.toString() } };
        } catch (err) {
          return { wallet, result: { ok: false, error: errText(err) } };
        }
      }),
    ),
    client.multicall({ contracts, allowFailure: true, blockNumber }),
  ]);

  const tokens: TokenBalanceRow[] = [];
  let i = 0;
  for (const sc of stablecoins) {
    for (const wallet of wallets) {
      const r = tokenResults[i++];
      const base = {
        wallet,
        token: getAddress(sc.address),
        symbol: sc.symbol,
        decimals: sc.decimals,
      };
      if (r && r.status === "success") {
        tokens.push({ ...base, result: { ok: true, value: (r.result as bigint).toString() } });
      } else {
        tokens.push({
          ...base,
          result: { ok: false, error: r ? errText(r.error) : "missing multicall result" },
        });
      }
    }
  }

  const { partial, ...totals } = summarise(nativeResults, tokens, stablecoins);
  return {
    blockNumber: blockNumber.toString(),
    method: "multicall3",
    elapsedMs: Math.round(performance.now() - started),
    native: nativeResults,
    tokens,
    partial,
    totals,
  };
}

export type SnapshotComparison = {
  identical: boolean;
  mismatches: Array<{
    kind: "native" | "token";
    wallet: Address;
    token?: Address;
    individual: string;
    multicall: string;
  }>;
};

/** Confirms the two fetch strategies agree value-for-value at the same block. */
export function compareSnapshots(
  a: BalanceSnapshot,
  b: BalanceSnapshot,
): SnapshotComparison {
  const mismatches: SnapshotComparison["mismatches"] = [];
  const show = (o: Outcome<string>) => (o.ok ? o.value : `ERROR:${o.error}`);

  for (const rowA of a.native) {
    const rowB = b.native.find((r) => r.wallet === rowA.wallet);
    if (!rowB || show(rowA.result) !== show(rowB.result)) {
      mismatches.push({
        kind: "native",
        wallet: rowA.wallet,
        individual: show(rowA.result),
        multicall: rowB ? show(rowB.result) : "MISSING",
      });
    }
  }

  for (const rowA of a.tokens) {
    const rowB = b.tokens.find(
      (r) => r.wallet === rowA.wallet && r.token === rowA.token,
    );
    if (!rowB || show(rowA.result) !== show(rowB.result)) {
      mismatches.push({
        kind: "token",
        wallet: rowA.wallet,
        token: rowA.token,
        individual: show(rowA.result),
        multicall: rowB ? show(rowB.result) : "MISSING",
      });
    }
  }

  return { identical: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// NFT aggregation
// ---------------------------------------------------------------------------

export type WalletNftOutcome = {
  wallet: Address;
  result: Outcome<WalletNft[]>;
  elapsedMs: number;
};

export type NftAggregate = {
  provider: string;
  walletsRequested: number;
  walletsSucceeded: number;
  walletsFailed: Array<{ wallet: Address; error: string }>;
  /** True when at least one wallet failed: collections below are incomplete. */
  partial: boolean;
  totalNfts: number;
  duplicatesDropped: number;
  collections: Array<{
    chainId: 143;
    collectionAddress: Address;
    collectionName: string | null;
    count: number;
    owners: Address[];
    tokens: Array<{
      tokenId: string;
      owner: Address;
      tokenName: string | null;
      imageUrl: string | null;
      metadataMissing: boolean;
    }>;
  }>;
};

/**
 * Deduplicates by (chainId, collectionAddress, tokenId) and groups by
 * collection, preserving the owning wallet.
 *
 * A wallet whose fetch failed is recorded in `walletsFailed` and sets
 * `partial` — it is never rendered as a wallet that simply owns nothing.
 */
export function aggregateNfts(
  provider: string,
  outcomes: WalletNftOutcome[],
): NftAggregate {
  const seen = new Set<string>();
  const byCollection = new Map<string, NftAggregate["collections"][number]>();
  const walletsFailed: NftAggregate["walletsFailed"] = [];
  let duplicatesDropped = 0;
  let totalNfts = 0;

  for (const outcome of outcomes) {
    if (!outcome.result.ok) {
      walletsFailed.push({ wallet: outcome.wallet, error: outcome.result.error });
      continue;
    }
    for (const nft of outcome.result.value) {
      const collection = getAddress(nft.collectionAddress);
      const key = `${nft.chainId}:${collection.toLowerCase()}:${nft.tokenId}`;
      if (seen.has(key)) {
        duplicatesDropped++;
        continue;
      }
      seen.add(key);
      totalNfts++;

      let group = byCollection.get(collection.toLowerCase());
      if (!group) {
        group = {
          chainId: nft.chainId,
          collectionAddress: collection,
          collectionName: nft.collectionName,
          count: 0,
          owners: [],
          tokens: [],
        };
        byCollection.set(collection.toLowerCase(), group);
      }
      // Keep the first non-null collection name we see.
      if (!group.collectionName && nft.collectionName) {
        group.collectionName = nft.collectionName;
      }
      const owner = getAddress(nft.owner);
      if (!group.owners.includes(owner)) group.owners.push(owner);
      group.count++;
      group.tokens.push({
        tokenId: nft.tokenId,
        owner,
        tokenName: nft.tokenName,
        imageUrl: nft.imageUrl,
        metadataMissing: nft.tokenName === null && nft.imageUrl === null,
      });
    }
  }

  return {
    provider,
    walletsRequested: outcomes.length,
    walletsSucceeded: outcomes.length - walletsFailed.length,
    walletsFailed,
    partial: walletsFailed.length > 0,
    totalNfts,
    duplicatesDropped,
    collections: [...byCollection.values()].sort((a, b) => b.count - a.count),
  };
}
