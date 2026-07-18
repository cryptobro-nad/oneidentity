import { describe, expect, it } from "vitest";
import {
  buildGasPlan,
  clampBufferPercent,
  DEFAULT_GAS_BUFFER_PERCENT,
  FIVE_WALLET_WORST_CASE_GAS,
  MAX_GAS_BUFFER_PERCENT,
  MIN_GAS_BUFFER_PERCENT,
} from "./gas";
// MAX_GAS_BUFFER_PERCENT is asserted in the clamp-above-maximum case.

// Measured from forge --gas-report: createOne min 23,363 / avg 823,614 /
// max 1,164,036. A realistic two-wallet creation lands near 0.9M.
const TWO_WALLET_GAS = 917_119n;
const FIVE_WALLET_GAS = 1_164_036n;
const GAS_PRICE = 102_000_000_000n; // 102 gwei, the observed Monad price

describe("buildGasPlan", () => {
  it("applies the default buffer to the exact estimate", () => {
    const plan = buildGasPlan(TWO_WALLET_GAS, GAS_PRICE);
    expect(plan.bufferPercent).toBe(DEFAULT_GAS_BUFFER_PERCENT);
    expect(plan.gasLimit).toBe((TWO_WALLET_GAS * 110n) / 100n);
    expect(plan.estimatedGas).toBe(TWO_WALLET_GAS);
  });

  it("computes max cost from the LIMIT, because Monad bills the limit", () => {
    const plan = buildGasPlan(TWO_WALLET_GAS, GAS_PRICE);
    expect(plan.maxCostWei).toBe(plan.gasLimit * GAS_PRICE);
  });

  it("reports what the same call would cost if billed on usage", () => {
    const plan = buildGasPlan(TWO_WALLET_GAS, GAS_PRICE);
    expect(plan.costIfChargedOnUsageWei).toBe(TWO_WALLET_GAS * GAS_PRICE);
    expect(plan.bufferCostWei).toBe(plan.maxCostWei - plan.costIfChargedOnUsageWei);
    expect(plan.bufferCostWei).toBeGreaterThan(0n);
  });

  it("respects a custom buffer", () => {
    const plan = buildGasPlan(TWO_WALLET_GAS, GAS_PRICE, 20);
    expect(plan.bufferPercent).toBe(20);
    expect(plan.gasLimit).toBe((TWO_WALLET_GAS * 120n) / 100n);
  });
});

describe("a two-wallet ONE is not charged the five-wallet worst case", () => {
  it("keeps the two-wallet limit below the five-wallet ceiling", () => {
    const twoWallet = buildGasPlan(TWO_WALLET_GAS, GAS_PRICE);
    expect(twoWallet.gasLimit).toBeLessThan(FIVE_WALLET_WORST_CASE_GAS);
  });

  it("saves real MON versus hardcoding the worst case", () => {
    const twoWallet = buildGasPlan(TWO_WALLET_GAS, GAS_PRICE);
    const worstCaseCost = FIVE_WALLET_WORST_CASE_GAS * GAS_PRICE;
    expect(twoWallet.maxCostWei).toBeLessThan(worstCaseCost);

    // The saving should be meaningful, not rounding noise: at least 10%.
    const saved = worstCaseCost - twoWallet.maxCostWei;
    expect(saved * 10n).toBeGreaterThan(worstCaseCost);
  });

  it("still covers a genuine five-wallet creation when that is what is estimated", () => {
    const fiveWallet = buildGasPlan(FIVE_WALLET_GAS, GAS_PRICE);
    expect(fiveWallet.gasLimit).toBeGreaterThanOrEqual(FIVE_WALLET_GAS);
  });
});

describe("clampBufferPercent", () => {
  it("clamps below the minimum", () => {
    expect(clampBufferPercent(0)).toBe(MIN_GAS_BUFFER_PERCENT);
    expect(clampBufferPercent(-50)).toBe(MIN_GAS_BUFFER_PERCENT);
  });

  it("clamps above the maximum", () => {
    expect(clampBufferPercent(500)).toBe(MAX_GAS_BUFFER_PERCENT);
  });

  it("passes through a sane value", () => {
    expect(clampBufferPercent(15)).toBe(15);
  });

  it("falls back to the default for non-finite input", () => {
    // Nonsense input must land on the cheap default, not the 50% ceiling —
    // on Monad an inflated buffer is billed, so failing open would cost money.
    expect(clampBufferPercent(Number.NaN)).toBe(DEFAULT_GAS_BUFFER_PERCENT);
    expect(clampBufferPercent(Number.POSITIVE_INFINITY)).toBe(DEFAULT_GAS_BUFFER_PERCENT);
    expect(clampBufferPercent(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_GAS_BUFFER_PERCENT);
  });

  it("never produces a limit below the estimate", () => {
    const plan = buildGasPlan(TWO_WALLET_GAS, GAS_PRICE, 0);
    expect(plan.gasLimit).toBeGreaterThan(TWO_WALLET_GAS);
  });
});
