import { describe, expect, it } from "vitest";
import { getAddress, isAddress } from "viem";
import { MONAD_LIST_TOKENS } from "./monadTokenList";
import { ALL_BALANCE_TOKENS } from "./tokens";
import { ZERO_ADDRESS } from "./addresses";

const REQUIRED = ["WMON", "USDC", "USDT0", "AUSD", "aprMON", "gMON", "shMON", "WETH", "WBTC", "BTC.b"];

describe("Monad token-list registry", () => {
  it("includes every required broad-fallback token", () => {
    const symbols = new Set(MONAD_LIST_TOKENS.map((t) => t.symbol));
    for (const s of REQUIRED) expect(symbols.has(s)).toBe(true);
  });

  it("uses only valid, EIP-55 checksummed addresses", () => {
    for (const t of MONAD_LIST_TOKENS) {
      expect(isAddress(t.address)).toBe(true);
      expect(getAddress(t.address)).toBe(t.address); // already checksummed
    }
  });

  it("never includes native MON (0x000…000) as an ERC-20 to read", () => {
    for (const t of MONAD_LIST_TOKENS) {
      expect(t.address.toLowerCase()).not.toBe(ZERO_ADDRESS.toLowerCase());
    }
  });

  it("carries display metadata (name, decimals, logo) for each token", () => {
    for (const t of MONAD_LIST_TOKENS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.decimals).toBeGreaterThanOrEqual(0);
      expect(t.logoURI).toContain(t.symbol);
    }
  });
});

describe("ALL_BALANCE_TOKENS after the registry merge", () => {
  it("de-duplicates by contract address", () => {
    const addrs = ALL_BALANCE_TOKENS.map((t) => t.address.toLowerCase());
    expect(new Set(addrs).size).toBe(addrs.length);
  });

  it("keeps symbols unique, so the symbol-keyed totals never collide", () => {
    const symbols = ALL_BALANCE_TOKENS.map((t) => t.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("surfaces the newly supported majors alongside the curated set", () => {
    const symbols = new Set(ALL_BALANCE_TOKENS.map((t) => t.symbol));
    for (const s of ["WMON", "aprMON", "gMON", "shMON", "WETH", "WBTC", "BTC.b"]) {
      expect(symbols.has(s)).toBe(true);
    }
    // The curated set is preserved.
    expect(symbols.has("CHOG")).toBe(true);
    expect(symbols.has("USDC")).toBe(true);
  });
});
