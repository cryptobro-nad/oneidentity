/**
 * Portfolio domain types.
 *
 * Shaped so Verified ONE can reuse every one of these later: the only thing
 * that changes is where the address list comes from — user input today, the
 * Registry's `membersOf(one)` tomorrow. Nothing here assumes manual entry.
 */

export type PortfolioAddress = `0x${string}`;

/**
 * The result of a single balance read.
 *
 * A failed read is NEVER represented as `rawValue: 0n`. `success: false` with
 * an `error` is the only way a failure can be expressed, which is what lets the
 * UI distinguish "holds nothing" from "we could not find out".
 */
export type AssetReadResult = {
  success: boolean;
  rawValue?: bigint;
  error?: string;
};

export type WalletPortfolio = {
  address: PortfolioAddress;
  mon: AssetReadResult;
  /** Keyed by token symbol, e.g. "USDC". */
  stablecoins: Record<string, AssetReadResult>;
};

export type AggregatedPortfolio = {
  wallets: WalletPortfolio[];
  /** Keyed by symbol including "MON". Sums successful reads only. */
  totals: Record<string, bigint>;
  blockNumber: bigint;
  /** True when at least one read failed — totals are then incomplete. */
  partial: boolean;
  /** Which RPC endpoint actually served this data. */
  endpointUsed: string;
  /** Endpoints that failed before one succeeded. */
  failedEndpoints: { url: string; error: string }[];
  fetchedAt: number;
};

export type FailedRead = {
  address: PortfolioAddress;
  symbol: string;
  error: string;
};

/** Every read that failed, for the "Partial data loaded" panel. */
export function collectFailedReads(portfolio: AggregatedPortfolio): FailedRead[] {
  const failures: FailedRead[] = [];
  for (const wallet of portfolio.wallets) {
    if (!wallet.mon.success) {
      failures.push({
        address: wallet.address,
        symbol: "MON",
        error: wallet.mon.error ?? "unknown error",
      });
    }
    for (const [symbol, result] of Object.entries(wallet.stablecoins)) {
      if (!result.success) {
        failures.push({
          address: wallet.address,
          symbol,
          error: result.error ?? "unknown error",
        });
      }
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// NFT collection check
// ---------------------------------------------------------------------------

export type NftWalletCount = {
  address: PortfolioAddress;
  result: AssetReadResult;
};

export type NftCollectionCheck =
  | { status: "not-a-contract"; address: PortfolioAddress }
  | { status: "not-erc721"; address: PortfolioAddress }
  | {
      status: "ok";
      address: PortfolioAddress;
      wallets: NftWalletCount[];
      /** Sum of successful reads only. */
      total: bigint;
      partial: boolean;
      blockNumber: bigint;
      endpointUsed: string;
      checkedAt: number;
    };
