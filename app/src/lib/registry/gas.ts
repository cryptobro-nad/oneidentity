/**
 * Gas estimation and limit policy for Monad Mainnet.
 *
 * ## Why this file exists
 *
 * Monad charges the SUBMITTED GAS LIMIT, not gas consumed:
 *
 *   "Transactions are charged based on gas limit rather than gas usage, i.e.
 *    total gas deducted from the sender's balance is value + gas_bid * gas_limit"
 *   — https://docs.monad.xyz/developer-essentials/differences
 *
 * Confirmed by the registry deployment itself: the EVM consumed 2,322,525 gas
 * but the receipt billed 3,043,418 — the limit — costing 0.310428636 MON.
 *
 * The consequence is specific and expensive: padding a gas limit "to be safe"
 * is not free insurance, it is a direct surcharge. `createOne()` ranges from
 * roughly 0.9M gas for two wallets to 1.2M for five, so applying a five-wallet
 * worst case to a two-wallet identity would overcharge by ~30% on every single
 * creation. This module therefore estimates the EXACT call and applies one
 * small, documented, configurable buffer.
 *
 * ## The tradeoff
 *
 * Too little gas  -> the transaction runs out of gas, reverts, and the user is
 *                    still charged the full limit. Money lost, no ONE created.
 * Too much gas    -> the transaction succeeds but the user overpays the
 *                    difference, because Monad bills the limit either way.
 *
 * On Ethereum the second case is nearly free, so wallets pad generously. On
 * Monad it is a real cost, so the buffer is deliberately small. It is not zero
 * because `eth_estimateGas` is evaluated against pending state; a block landing
 * between estimate and inclusion can shift consumption slightly.
 */

export const DEFAULT_GAS_BUFFER_PERCENT = 10;

/** Guard rails so a caller cannot configure an unsafe or wasteful buffer. */
export const MIN_GAS_BUFFER_PERCENT = 5;
export const MAX_GAS_BUFFER_PERCENT = 50;

export type GasPlan = {
  /** Raw eth_estimateGas result for the exact calldata. */
  estimatedGas: bigint;
  /** Buffer actually applied, after clamping. */
  bufferPercent: number;
  /** estimatedGas * (100 + buffer) / 100 — what gets submitted and billed. */
  gasLimit: bigint;
  /** Current network gas price (wei). */
  gasPrice: bigint;
  /**
   * gasLimit * gasPrice. On Monad this is the ACTUAL charge, not a ceiling.
   */
  maxCostWei: bigint;
  /** What the same transaction would cost if only consumed gas were billed. */
  costIfChargedOnUsageWei: bigint;
  /** The premium paid purely for the buffer, in wei. */
  bufferCostWei: bigint;
};

export function clampBufferPercent(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_GAS_BUFFER_PERCENT;
  return Math.min(MAX_GAS_BUFFER_PERCENT, Math.max(MIN_GAS_BUFFER_PERCENT, Math.round(percent)));
}

export function buildGasPlan(
  estimatedGas: bigint,
  gasPrice: bigint,
  bufferPercent: number = DEFAULT_GAS_BUFFER_PERCENT,
): GasPlan {
  const buffer = clampBufferPercent(bufferPercent);
  const gasLimit = (estimatedGas * BigInt(100 + buffer)) / 100n;
  const maxCostWei = gasLimit * gasPrice;
  const costIfChargedOnUsageWei = estimatedGas * gasPrice;

  return {
    estimatedGas,
    bufferPercent: buffer,
    gasLimit,
    gasPrice,
    maxCostWei,
    costIfChargedOnUsageWei,
    bufferCostWei: maxCostWei - costIfChargedOnUsageWei,
  };
}

/**
 * The hardcoded worst case this policy deliberately avoids.
 *
 * Exported so a test can assert a two-wallet plan is materially cheaper than
 * blanket-applying the five-wallet ceiling. Sourced from
 * `forge test --gas-report`: createOne max = 1,164,036.
 */
export const FIVE_WALLET_WORST_CASE_GAS = 1_164_036n;

export function isSuspiciouslyCloseToWorstCase(gasLimit: bigint): boolean {
  return gasLimit >= FIVE_WALLET_WORST_CASE_GAS;
}
