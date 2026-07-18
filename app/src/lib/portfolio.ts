/**
 * Combined balance loading across up to five wallets.
 *
 * Mirrors `ONEIdentity.combinedERC20Balance` semantics: a read that fails is
 * reported as a failure and excluded from the total, never counted as zero.
 * The spike measured Multicall3 at ~12x faster than sequential calls for this
 * exact shape of query, so token reads go through multicall.
 */

import { erc20Abi, getAddress, type PublicClient } from "viem";
import { withRpcFallback, errorText, type WithRpcOptions } from "./rpc";
import { NATIVE_SYMBOL, SUPPORTED_STABLECOINS, type SupportedStablecoin } from "./tokens";
import type {
  AggregatedPortfolio,
  AssetReadResult,
  PortfolioAddress,
  WalletPortfolio,
} from "./types";

const ok = (value: bigint): AssetReadResult => ({ success: true, rawValue: value });
const failed = (error: string): AssetReadResult => ({ success: false, error });

export type LoadPortfolioOptions = WithRpcOptions & {
  tokens?: readonly SupportedStablecoin[];
  /** Injected in tests to control the clock. */
  now?: () => number;
};

/**
 * Reads native + stablecoin balances for every wallet at one pinned block.
 *
 * Pinning matters: without it a slow multicall could straddle two blocks and
 * produce a "combined total" that never existed at any single moment.
 */
export async function loadPortfolioWithClient(
  client: PublicClient,
  addresses: readonly PortfolioAddress[],
  tokens: readonly SupportedStablecoin[] = SUPPORTED_STABLECOINS,
): Promise<{
  wallets: WalletPortfolio[];
  totals: Record<string, bigint>;
  blockNumber: bigint;
  partial: boolean;
}> {
  const wallets = addresses.map((a) => getAddress(a));
  const blockNumber = await client.getBlockNumber();

  // Native balances. These are plain eth_getBalance calls; the transport
  // batches them into a single HTTP request.
  const nativeResults = await Promise.all(
    wallets.map(async (address): Promise<AssetReadResult> => {
      try {
        const balance = await client.getBalance({ address, blockNumber });
        return ok(balance);
      } catch (err) {
        return failed(errorText(err));
      }
    }),
  );

  // Token balances via Multicall3. `allowFailure` keeps one bad token from
  // destroying the batch while still telling us exactly which call failed.
  const contracts = tokens.flatMap((token) =>
    wallets.map((address) => ({
      address: getAddress(token.address),
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address] as const,
    })),
  );

  // viem's multicall return type is generic over the contracts tuple; the flat
  // shape is all we need, so narrow it explicitly rather than fighting inference.
  type MulticallEntry =
    | { status: "success"; result: unknown }
    | { status: "failure"; error: unknown };

  let tokenResults: readonly MulticallEntry[];
  try {
    tokenResults = (await client.multicall({
      contracts,
      allowFailure: true,
      blockNumber,
    })) as readonly MulticallEntry[];
  } catch (err) {
    // The multicall itself failed (bad RPC, aggregate reverted). Rethrow so
    // withRpcFallback can try the next endpoint rather than reporting zeros.
    throw new Error(`multicall failed: ${errorText(err)}`);
  }

  const walletPortfolios: WalletPortfolio[] = wallets.map((address, walletIndex) => {
    const stablecoins: Record<string, AssetReadResult> = {};
    tokens.forEach((token, tokenIndex) => {
      const flatIndex = tokenIndex * wallets.length + walletIndex;
      const entry = tokenResults[flatIndex];
      if (entry && entry.status === "success") {
        stablecoins[token.symbol] = ok(entry.result as bigint);
      } else {
        stablecoins[token.symbol] = failed(
          entry ? errorText(entry.error) : "no result returned for this call",
        );
      }
    });
    return {
      address,
      mon: nativeResults[walletIndex] ?? failed("no native result returned"),
      stablecoins,
    };
  });

  // Totals sum successful reads only; any failure flags the whole set partial.
  const totals: Record<string, bigint> = { [NATIVE_SYMBOL]: 0n };
  for (const token of tokens) totals[token.symbol] = 0n;

  let partial = false;
  for (const wallet of walletPortfolios) {
    if (wallet.mon.success && wallet.mon.rawValue !== undefined) {
      totals[NATIVE_SYMBOL] = (totals[NATIVE_SYMBOL] ?? 0n) + wallet.mon.rawValue;
    } else {
      partial = true;
    }
    for (const token of tokens) {
      const result = wallet.stablecoins[token.symbol];
      if (result?.success && result.rawValue !== undefined) {
        totals[token.symbol] = (totals[token.symbol] ?? 0n) + result.rawValue;
      } else {
        partial = true;
      }
    }
  }

  return { wallets: walletPortfolios, totals, blockNumber, partial };
}

/** Loads the portfolio, failing over to the next RPC endpoint if one dies. */
export async function loadPortfolio(
  addresses: readonly PortfolioAddress[],
  options: LoadPortfolioOptions = {},
): Promise<AggregatedPortfolio> {
  const tokens = options.tokens ?? SUPPORTED_STABLECOINS;
  const now = options.now ?? Date.now;

  const outcome = await withRpcFallback(
    (client) => loadPortfolioWithClient(client, addresses, tokens),
    options,
  );

  return {
    ...outcome.value,
    endpointUsed: outcome.endpointUsed,
    failedEndpoints: outcome.failedEndpoints,
    fetchedAt: now(),
  };
}
