import { describe, expect, it, vi } from "vitest";
import { STORAGE_KEY, loadStoredAddresses, saveStoredAddresses } from "./storage";
import type { PortfolioAddress } from "./types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    _dump: () => Object.fromEntries(store),
  };
}

describe("address persistence", () => {
  it("round-trips a list", () => {
    const storage = memoryStorage();
    saveStoredAddresses([A, B], storage);
    expect(loadStoredAddresses(storage)).toEqual([A, B]);
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadStoredAddresses(memoryStorage())).toEqual([]);
  });

  it("clears the key when saving an empty list", () => {
    const storage = memoryStorage();
    saveStoredAddresses([A], storage);
    saveStoredAddresses([], storage);
    expect(storage._dump()[STORAGE_KEY]).toBeUndefined();
    expect(loadStoredAddresses(storage)).toEqual([]);
  });

  it("re-validates on read, dropping tampered entries", () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify([A, "not-an-address", A.toLowerCase(), B]),
    });
    expect(loadStoredAddresses(storage)).toEqual([A, B]);
  });

  it("caps a tampered oversized list at five", () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify([
        A,
        B,
        "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946",
        "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799",
        "0xd651346d7c789536ebf06dc72aE3C8502cd695CC",
        "0xb2A44ce122FAB07Fc514ea7830623201b152D99D",
      ]),
    });
    expect(loadStoredAddresses(storage)).toHaveLength(5);
  });

  it("survives malformed JSON", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{not json" });
    expect(loadStoredAddresses(storage)).toEqual([]);
  });

  it("survives a non-array payload", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ a: 1 }) });
    expect(loadStoredAddresses(storage)).toEqual([]);
  });

  it("never throws when storage is unavailable", () => {
    const broken = {
      getItem: vi.fn(() => {
        throw new Error("SecurityError");
      }),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
      removeItem: vi.fn(() => {
        throw new Error("SecurityError");
      }),
    };
    expect(loadStoredAddresses(broken)).toEqual([]);
    expect(() => saveStoredAddresses([A], broken)).not.toThrow();
  });

  it("is a no-op with no storage at all (SSR)", () => {
    expect(loadStoredAddresses(undefined)).toEqual([]);
    expect(() => saveStoredAddresses([A], undefined)).not.toThrow();
  });
});
