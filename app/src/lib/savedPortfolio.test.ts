import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getServerSnapshot,
  getSnapshot,
  resetAddressStoreCache,
  setAddresses,
  subscribe,
  wasRestoredFromStorage,
} from "./addressStore";
import { STORAGE_KEY, loadStoredAddresses, saveStoredAddresses } from "./storage";
import type { PortfolioAddress } from "./types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

/** Minimal localStorage stand-in wired into the module under test. */
function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    _dump: () => Object.fromEntries(store),
  };
  vi.stubGlobal("window", { localStorage: mock, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("localStorage", mock);
  return mock;
}

beforeEach(() => {
  resetAddressStoreCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetAddressStoreCache();
});

describe("saved addresses restore across a remount", () => {
  it("restores a previously saved list", () => {
    installStorage({ [STORAGE_KEY]: JSON.stringify([A, B]) });
    // A fresh mount reads through the store for the first time.
    expect(getSnapshot()).toEqual([A, B]);
  });

  it("flags the list as restored from storage", () => {
    installStorage({ [STORAGE_KEY]: JSON.stringify([A, B]) });
    expect(wasRestoredFromStorage()).toBe(true);
  });

  it("does NOT flag an empty first visit as restored", () => {
    installStorage();
    expect(getSnapshot()).toEqual([]);
    expect(wasRestoredFromStorage()).toBe(false);
  });

  it("stops reporting 'restored' once the user edits the list", () => {
    installStorage({ [STORAGE_KEY]: JSON.stringify([A]) });
    expect(wasRestoredFromStorage()).toBe(true);

    setAddresses([A, B]);
    // A deliberate edit means this is no longer a passive restore.
    expect(wasRestoredFromStorage()).toBe(false);
  });

  it("gives the server an empty snapshot regardless of storage", () => {
    installStorage({ [STORAGE_KEY]: JSON.stringify([A, B]) });
    expect(getServerSnapshot()).toEqual([]);
  });

  it("notifies subscribers when the list changes", () => {
    installStorage();
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setAddresses([A]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("clear all", () => {
  it("removes the stored address list", () => {
    const storage = installStorage({ [STORAGE_KEY]: JSON.stringify([A, B]) });
    setAddresses([]);
    expect(storage._dump()[STORAGE_KEY]).toBeUndefined();
    expect(getSnapshot()).toEqual([]);
  });
});

describe("add and remove still behave", () => {
  it("adds a wallet", () => {
    installStorage();
    setAddresses([A]);
    expect(getSnapshot()).toEqual([A]);
  });

  it("removes a wallet", () => {
    installStorage({ [STORAGE_KEY]: JSON.stringify([A, B]) });
    setAddresses(getSnapshot().filter((x) => x !== A));
    expect(getSnapshot()).toEqual([B]);
  });

  it("persists across a simulated remount", () => {
    installStorage();
    setAddresses([A, B]);
    resetAddressStoreCache(); // remount
    expect(getSnapshot()).toEqual([A, B]);
  });
});

describe("ONLY addresses are persisted", () => {
  /** Everything the app must never write to storage. */
  const FORBIDDEN = [
    "9.4316", // MON balance
    "55444.2812", // MON balance
    "USDC",
    "USDT0",
    "AUSD",
    "ROARRR", // NFT collection name
    "Monad Pepes",
    "88730274", // block number
    "blockNumber",
    "totals",
    "collections",
    "perWallet",
    "loading",
    "error",
  ];

  it("writes nothing but the address array", () => {
    const storage = installStorage();
    setAddresses([A, B]);

    const raw = storage._dump()[STORAGE_KEY]!;
    expect(JSON.parse(raw)).toEqual([A, B]);

    for (const forbidden of FORBIDDEN) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("stores exactly one key", () => {
    const storage = installStorage();
    setAddresses([A, B]);
    expect(Object.keys(storage._dump())).toEqual([STORAGE_KEY]);
  });

  it("does not persist balances even if a caller tries to smuggle them", () => {
    const storage = installStorage();
    // saveStoredAddresses accepts an address array only; anything else is
    // filtered on the way back out.
    saveStoredAddresses([A, B]);
    const parsed = JSON.parse(storage._dump()[STORAGE_KEY]!) as unknown[];
    expect(parsed.every((v) => typeof v === "string")).toBe(true);
  });

  it("re-validates on read, dropping anything that is not an address", () => {
    installStorage({
      [STORAGE_KEY]: JSON.stringify([A, { mon: "9.43", block: 88730274 }, "junk", B]),
    });
    expect(loadStoredAddresses()).toEqual([A, B]);
  });
});
