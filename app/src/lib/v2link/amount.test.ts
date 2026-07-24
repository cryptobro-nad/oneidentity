import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import {
  generateAmountWei,
  AMOUNT_MIN_WEI,
  AMOUNT_MAX_WEI,
  AMOUNT_STEP_WEI,
  AMOUNT_STEPS,
  AMOUNT_DECIMALS,
} from "./challenge";
import { formatAmount } from "@/lib/format";

describe("verification amount", () => {
  it("uses exact integer wei constants (no floating point)", () => {
    expect(AMOUNT_MIN_WEI).toBe(10_000_000_000_000_000n); // 0.01 MON
    expect(AMOUNT_MAX_WEI).toBe(100_000_000_000_000_000n); // 0.1 MON
    expect(AMOUNT_STEP_WEI).toBe(1_000_000_000_000n); // 1e-6 MON
    expect(AMOUNT_STEPS).toBe(90_000n);
    expect(AMOUNT_DECIMALS).toBe(6);
  });

  it("generates amounts in [0.01, 0.1) aligned to the 6-decimal step", () => {
    // Deterministic sweep across the step space, including the wrap boundaries.
    for (const seed of [0n, 1n, 42n, 89_999n, 90_000n, 90_001n, 123_456_789n]) {
      const a = generateAmountWei(() => seed);
      expect(a).toBeGreaterThanOrEqual(AMOUNT_MIN_WEI);
      expect(a).toBeLessThan(AMOUNT_MAX_WEI);
      // Exactly a multiple of the step (so 6 decimals represent it with no loss).
      expect((a - AMOUNT_MIN_WEI) % AMOUNT_STEP_WEI).toBe(0n);
    }
  });

  it("maps step index deterministically", () => {
    expect(generateAmountWei(() => 0n)).toBe(AMOUNT_MIN_WEI);
    expect(generateAmountWei(() => 1n)).toBe(AMOUNT_MIN_WEI + AMOUNT_STEP_WEI);
    expect(generateAmountWei(() => AMOUNT_STEPS)).toBe(AMOUNT_MIN_WEI); // wraps
    expect(generateAmountWei(() => AMOUNT_STEPS + 5n)).toBe(AMOUNT_MIN_WEI + 5n * AMOUNT_STEP_WEI);
  });

  it("displays and round-trips to the exact wei (no rounding)", () => {
    // Every generated amount, shown at AMOUNT_DECIMALS, must parse back to itself.
    for (const seed of [0n, 1n, 7n, 12_345n, 89_999n, 55_555n]) {
      const wei = generateAmountWei(() => seed);
      const shown = formatAmount(wei, 18, AMOUNT_DECIMALS); // what the UI renders
      const reparsed = parseUnits(shown.replace(/,/g, ""), 18);
      expect(reparsed).toBe(wei);
    }
  });

  it("a truncating display would have lost precision on full-entropy amounts", () => {
    // Guards the fix: an unaligned 18-decimal amount rendered at 6 decimals no
    // longer round-trips — which is exactly why generation is step-aligned.
    const unaligned = AMOUNT_MIN_WEI + 123_456_789_012_345n; // not a step multiple
    const shown = formatAmount(unaligned, 18, AMOUNT_DECIMALS);
    expect(parseUnits(shown.replace(/,/g, ""), 18)).not.toBe(unaligned);
  });
});
