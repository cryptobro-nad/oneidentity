import { describe, expect, it } from "vitest";
import {
  removeAddress,
  sanitizeAddressList,
  validateCollectionAddress,
  validateNewAddress,
  ZERO_ADDRESS,
} from "./addresses";
import type { PortfolioAddress } from "./types";

// Real Monad Mainnet addresses discovered on-chain by the data spike.
const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;
const C = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946" as PortfolioAddress;
const D = "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799" as PortfolioAddress;
const E = "0xd651346d7c789536ebf06dc72aE3C8502cd695CC" as PortfolioAddress;
const F = "0xb2A44ce122FAB07Fc514ea7830623201b152D99D" as PortfolioAddress;

describe("validateNewAddress", () => {
  it("accepts a valid address into an empty list", () => {
    const result = validateNewAddress(A, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.address).toBe(A);
  });

  it("rejects an empty input", () => {
    const result = validateNewAddress("   ", []);
    expect(result).toMatchObject({ ok: false, reason: "empty" });
  });

  it("rejects an invalid address", () => {
    expect(validateNewAddress("not-an-address", [])).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    // Correct prefix, one hex character short.
    expect(validateNewAddress("0xB09684f5486d1af80699BbC27f14dd5A905da87", [])).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects the zero address", () => {
    expect(validateNewAddress(ZERO_ADDRESS, [])).toMatchObject({
      ok: false,
      reason: "zero-address",
    });
  });

  it("rejects a duplicate address", () => {
    expect(validateNewAddress(A, [A])).toMatchObject({ ok: false, reason: "duplicate" });
  });

  it("rejects a duplicate that differs only in checksum casing", () => {
    expect(validateNewAddress(A.toLowerCase(), [A])).toMatchObject({
      ok: false,
      reason: "duplicate",
    });
  });

  it("returns a checksummed address from lowercase input", () => {
    const result = validateNewAddress(A.toLowerCase(), []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.address).toBe(A);
  });

  it("accepts a fifth wallet", () => {
    expect(validateNewAddress(E, [A, B, C, D]).ok).toBe(true);
  });

  it("rejects a sixth wallet", () => {
    expect(validateNewAddress(F, [A, B, C, D, E])).toMatchObject({
      ok: false,
      reason: "max-reached",
    });
  });

  it("reports duplicate before max-reached on a full list", () => {
    // A user re-adding an existing wallet should be told it is a duplicate,
    // not that the list is full — the latter would be misleading.
    expect(validateNewAddress(A, [A, B, C, D, E])).toMatchObject({
      ok: false,
      reason: "duplicate",
    });
  });
});

describe("sanitizeAddressList", () => {
  it("keeps one valid wallet", () => {
    expect(sanitizeAddressList([A])).toEqual([A]);
  });

  it("keeps five valid wallets", () => {
    expect(sanitizeAddressList([A, B, C, D, E])).toHaveLength(5);
  });

  it("truncates more than five wallets", () => {
    expect(sanitizeAddressList([A, B, C, D, E, F])).toHaveLength(5);
  });

  it("drops invalid, zero and duplicate entries", () => {
    expect(sanitizeAddressList([A, "junk", ZERO_ADDRESS, A.toLowerCase(), B])).toEqual([A, B]);
  });

  it("drops non-string entries", () => {
    expect(sanitizeAddressList([A, 42, null, undefined, { a: 1 }])).toEqual([A]);
  });

  it("returns an empty list for empty input", () => {
    expect(sanitizeAddressList([])).toEqual([]);
  });
});

describe("removeAddress", () => {
  it("removes the target and preserves order", () => {
    expect(removeAddress([A, B, C], B)).toEqual([A, C]);
  });

  it("is case-insensitive", () => {
    expect(removeAddress([A, B], B.toLowerCase() as PortfolioAddress)).toEqual([A]);
  });

  it("is a no-op when the address is absent", () => {
    expect(removeAddress([A], B)).toEqual([A]);
  });
});

describe("validateCollectionAddress", () => {
  it("accepts a valid collection address", () => {
    const result = validateCollectionAddress("0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC");
    expect(result.ok).toBe(true);
  });

  it("rejects empty and invalid input", () => {
    expect(validateCollectionAddress("")).toMatchObject({ ok: false, reason: "empty" });
    expect(validateCollectionAddress("0xzz")).toMatchObject({ ok: false, reason: "invalid" });
  });
});
