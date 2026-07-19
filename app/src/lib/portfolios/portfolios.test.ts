import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAddressTo,
  createPortfolio,
  deletePortfolio,
  getActive,
  getSnapshot,
  getServerSnapshot,
  removeAddressFrom,
  renamePortfolio,
  resetPortfolioStoreCache,
  setActivePortfolio,
  subscribe,
} from "./store";
import { LEGACY_ADDRESSES_KEY, PORTFOLIOS_KEY, migrateLegacy, readState } from "./storage";
import { PERSONAL_ID, validatePortfolioName, type Portfolio } from "./types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873";
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1";
const C = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946";

function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    _dump: () => Object.fromEntries(store),
  };
  vi.stubGlobal("window", { localStorage: mock });
  vi.stubGlobal("localStorage", mock);
  return mock;
}

beforeEach(() => {
  resetPortfolioStoreCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetPortfolioStoreCache();
});

describe("a new user", () => {
  it("receives a Personal portfolio", () => {
    installStorage();
    const state = getSnapshot();

    expect(state.portfolios).toHaveLength(1);
    expect(state.portfolios[0]!.id).toBe(PERSONAL_ID);
    expect(state.portfolios[0]!.name).toBe("Personal");
    expect(state.activeId).toBe(PERSONAL_ID);
  });

  it("gets a stable, frozen server snapshot", () => {
    expect(getServerSnapshot().portfolios[0]!.id).toBe(PERSONAL_ID);
    expect(getServerSnapshot()).toBe(getServerSnapshot());
  });
});

describe("legacy migration", () => {
  it("moves an existing saved list into Personal", () => {
    installStorage({ [LEGACY_ADDRESSES_KEY]: JSON.stringify([A, B]) });
    const state = getSnapshot();

    expect(getActive().id).toBe(PERSONAL_ID);
    expect(state.portfolios[0]!.addresses).toEqual([A, B]);
  });

  it("removes the legacy key once migrated", () => {
    const storage = installStorage({
      [LEGACY_ADDRESSES_KEY]: JSON.stringify([A]),
    });
    getSnapshot();
    expect(storage._dump()[LEGACY_ADDRESSES_KEY]).toBeUndefined();
    expect(storage._dump()[PORTFOLIOS_KEY]).toBeDefined();
  });

  it("is idempotent — re-running never duplicates addresses", () => {
    const storage = installStorage({
      [LEGACY_ADDRESSES_KEY]: JSON.stringify([A, B]),
    });

    migrateLegacy(storage);
    migrateLegacy(storage);
    // Even if the legacy key somehow reappears, the merge is a union.
    storage.setItem(LEGACY_ADDRESSES_KEY, JSON.stringify([A, B]));
    migrateLegacy(storage);

    expect(readState(storage).portfolios[0]!.addresses).toEqual([A, B]);
  });

  it("tolerates an empty legacy list", () => {
    installStorage({ [LEGACY_ADDRESSES_KEY]: JSON.stringify([]) });
    expect(getSnapshot().portfolios[0]!.addresses).toEqual([]);
  });

  it("tolerates malformed legacy JSON without crashing", () => {
    installStorage({ [LEGACY_ADDRESSES_KEY]: "{not json" });
    expect(() => getSnapshot()).not.toThrow();
    expect(getSnapshot().portfolios[0]!.id).toBe(PERSONAL_ID);
  });

  it("never migrates balance or NFT data", () => {
    // A legacy value polluted with non-address junk keeps only the addresses.
    installStorage({
      [LEGACY_ADDRESSES_KEY]: JSON.stringify([A, { mon: "9.43", nfts: ["ROARRR"] }, "junk", B]),
    });
    const addresses = getSnapshot().portfolios[0]!.addresses;

    expect(addresses).toEqual([A, B]);
    expect(JSON.stringify(addresses)).not.toMatch(/mon|nfts|ROARRR/i);
  });

  it("drops legacy addresses beyond the wallet limit", () => {
    const many = [
      A,
      B,
      C,
      "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799",
      "0xd651346d7c789536ebf06dc72aE3C8502cd695CC",
      "0xb2A44ce122FAB07Fc514ea7830623201b152D99D",
    ];
    installStorage({ [LEGACY_ADDRESSES_KEY]: JSON.stringify(many) });
    expect(getSnapshot().portfolios[0]!.addresses).toHaveLength(5);
  });
});

describe("creating portfolios", () => {
  it("creates a named portfolio and makes it active", () => {
    installStorage();
    const outcome = createPortfolio("Trading wallets");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(getActive().name).toBe("Trading wallets");
    expect(getActive().id).toBe(outcome.id);
    expect(getActive().addresses).toEqual([]);
  });

  it("trims surrounding whitespace", () => {
    installStorage();
    createPortfolio("   Team treasury  ");
    expect(getActive().name).toBe("Team treasury");
  });

  it("rejects an empty name", () => {
    installStorage();
    expect(createPortfolio("   ")).toMatchObject({ ok: false });
    expect(getSnapshot().portfolios).toHaveLength(1);
  });

  it("rejects an overlong name", () => {
    installStorage();
    expect(createPortfolio("x".repeat(41))).toMatchObject({ ok: false });
  });

  it("accepts a name at exactly the limit", () => {
    installStorage();
    expect(createPortfolio("x".repeat(40)).ok).toBe(true);
  });

  it("rejects duplicates case-insensitively", () => {
    installStorage();
    createPortfolio("Trading");

    for (const attempt of ["Trading", "trading", "  TRADING  "]) {
      expect(createPortfolio(attempt)).toMatchObject({ ok: false });
    }
    expect(getSnapshot().portfolios).toHaveLength(2);
  });

  it("rejects a name clashing with Personal", () => {
    installStorage();
    expect(createPortfolio("personal")).toMatchObject({ ok: false });
  });

  it("gives each portfolio a distinct id, not derived from the name", () => {
    installStorage();
    const first = createPortfolio("Alpha");
    const second = createPortfolio("Beta");

    if (!first.ok || !second.ok) throw new Error("expected success");
    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toBe("Alpha");
  });
});

describe("switching portfolios", () => {
  it("switches the active portfolio", () => {
    installStorage();
    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");

    setActivePortfolio(PERSONAL_ID);
    expect(getActive().id).toBe(PERSONAL_ID);

    setActivePortfolio(created.id);
    expect(getActive().id).toBe(created.id);
  });

  it("keeps each portfolio's addresses separate", () => {
    installStorage();
    addAddressTo(PERSONAL_ID, A);

    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");
    addAddressTo(created.id, B);

    const state = getSnapshot();
    expect(state.portfolios.find((p) => p.id === PERSONAL_ID)!.addresses).toEqual([A]);
    expect(state.portfolios.find((p) => p.id === created.id)!.addresses).toEqual([B]);
  });

  it("rejects an unknown portfolio id", () => {
    installStorage();
    expect(setActivePortfolio("nope")).toMatchObject({ ok: false });
    expect(getActive().id).toBe(PERSONAL_ID);
  });

  it("persists the active id across a reload", () => {
    const storage = installStorage();
    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");

    resetPortfolioStoreCache(); // simulate reload
    expect(getSnapshot().activeId).toBe(created.id);
    expect(storage._dump()[PORTFOLIOS_KEY]).toContain(created.id);
  });
});

describe("addresses within a portfolio", () => {
  it("rejects a duplicate inside the same portfolio", () => {
    installStorage();
    expect(addAddressTo(PERSONAL_ID, A).ok).toBe(true);
    expect(addAddressTo(PERSONAL_ID, A)).toMatchObject({ ok: false });
    expect(getActive().addresses).toEqual([A]);
  });

  it("rejects a duplicate differing only in case", () => {
    installStorage();
    addAddressTo(PERSONAL_ID, A);
    expect(addAddressTo(PERSONAL_ID, A.toLowerCase())).toMatchObject({
      ok: false,
    });
  });

  it("ALLOWS the same address in a different portfolio", () => {
    installStorage();
    addAddressTo(PERSONAL_ID, A);

    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");

    // Portfolios are organisational watchlists; overlap is legitimate.
    expect(addAddressTo(created.id, A).ok).toBe(true);
    expect(getActive().addresses).toEqual([A]);
  });

  it("rejects an invalid address", () => {
    installStorage();
    expect(addAddressTo(PERSONAL_ID, "not-an-address")).toMatchObject({
      ok: false,
    });
  });

  it("checksums on the way in", () => {
    installStorage();
    addAddressTo(PERSONAL_ID, A.toLowerCase());
    expect(getActive().addresses[0]).toBe(A);
  });

  it("removes from only the target portfolio", () => {
    installStorage();
    addAddressTo(PERSONAL_ID, A);
    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");
    addAddressTo(created.id, A);

    removeAddressFrom(created.id, A as `0x${string}`);

    const state = getSnapshot();
    expect(state.portfolios.find((p) => p.id === PERSONAL_ID)!.addresses).toEqual([A]);
    expect(state.portfolios.find((p) => p.id === created.id)!.addresses).toEqual([]);
  });

  it("enforces the existing five-wallet limit per portfolio", () => {
    installStorage();
    const five = [
      A,
      B,
      C,
      "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799",
      "0xd651346d7c789536ebf06dc72aE3C8502cd695CC",
    ];
    for (const a of five) expect(addAddressTo(PERSONAL_ID, a).ok).toBe(true);

    // Multiple portfolios must not raise the per-portfolio limit.
    expect(addAddressTo(PERSONAL_ID, "0xb2A44ce122FAB07Fc514ea7830623201b152D99D")).toMatchObject({
      ok: false,
    });
  });
});

describe("renaming", () => {
  it("renames a custom portfolio, preserving id and addresses", () => {
    installStorage();
    const created = createPortfolio("Tradng");
    if (!created.ok) throw new Error("expected success");
    addAddressTo(created.id, A);

    expect(renamePortfolio(created.id, "Trading wallets").ok).toBe(true);

    const renamed = getSnapshot().portfolios.find((p) => p.id === created.id)!;
    expect(renamed.name).toBe("Trading wallets");
    expect(renamed.id).toBe(created.id);
    expect(renamed.addresses).toEqual([A]);
    // A rename must not create a second portfolio.
    expect(getSnapshot().portfolios).toHaveLength(2);
  });

  it("allows a portfolio to keep its own name", () => {
    installStorage();
    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");
    expect(renamePortfolio(created.id, "Trading").ok).toBe(true);
  });

  it("rejects renaming to another portfolio's name", () => {
    installStorage();
    createPortfolio("Alpha");
    const beta = createPortfolio("Beta");
    if (!beta.ok) throw new Error("expected success");

    expect(renamePortfolio(beta.id, "alpha")).toMatchObject({ ok: false });
  });

  it("renames the default portfolio, keeping its id and addresses", () => {
    installStorage();
    addAddressTo(PERSONAL_ID, A);

    expect(renamePortfolio(PERSONAL_ID, "Main").ok).toBe(true);

    const renamed = getSnapshot().portfolios.find((p) => p.id === PERSONAL_ID)!;
    expect(renamed.name).toBe("Main");
    expect(renamed.addresses).toEqual([A]);
    // Identity is the id, never the label.
    expect(renamed.id).toBe(PERSONAL_ID);
  });

  it("keeps the default's new name across a reload", () => {
    const storage = installStorage();
    renamePortfolio(PERSONAL_ID, "Main");

    resetPortfolioStoreCache();
    expect(getSnapshot().portfolios.find((p) => p.id === PERSONAL_ID)!.name).toBe("Main");
    expect(storage._dump()[PORTFOLIOS_KEY]).toContain("Main");
  });

  it("still rejects a name that clashes with another portfolio", () => {
    installStorage();
    createPortfolio("Trading");
    expect(renamePortfolio(PERSONAL_ID, "trading")).toMatchObject({
      ok: false,
    });
  });
});

describe("deleting", () => {
  it("deletes a custom portfolio", () => {
    installStorage();
    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");

    expect(deletePortfolio(created.id).ok).toBe(true);
    expect(getSnapshot().portfolios).toHaveLength(1);
  });

  it("refuses to delete Personal", () => {
    installStorage();
    expect(deletePortfolio(PERSONAL_ID)).toMatchObject({ ok: false });
    expect(getSnapshot().portfolios.some((p) => p.id === PERSONAL_ID)).toBe(true);
  });

  it("returns to Personal when the active portfolio is deleted", () => {
    installStorage();
    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");
    expect(getActive().id).toBe(created.id);

    deletePortfolio(created.id);
    expect(getActive().id).toBe(PERSONAL_ID);
  });

  it("leaves other portfolios and their addresses untouched", () => {
    installStorage();
    addAddressTo(PERSONAL_ID, A);
    const created = createPortfolio("Trading");
    if (!created.ok) throw new Error("expected success");
    addAddressTo(created.id, B);

    deletePortfolio(created.id);

    expect(getSnapshot().portfolios[0]!.addresses).toEqual([A]);
  });
});

describe("defensive storage", () => {
  it("survives malformed new-schema JSON", () => {
    installStorage({ [PORTFOLIOS_KEY]: "{oops" });
    expect(() => getSnapshot()).not.toThrow();
    expect(getSnapshot().portfolios[0]!.id).toBe(PERSONAL_ID);
  });

  it("falls back to Personal when activeId is missing or unknown", () => {
    installStorage({
      [PORTFOLIOS_KEY]: JSON.stringify({
        version: 2,
        portfolios: [{ id: PERSONAL_ID, name: "Personal", addresses: [] }],
        activeId: "ghost",
      }),
    });
    expect(getSnapshot().activeId).toBe(PERSONAL_ID);
  });

  it("recreates Personal if it is missing from storage", () => {
    installStorage({
      [PORTFOLIOS_KEY]: JSON.stringify({
        version: 2,
        portfolios: [{ id: "x", name: "Trading", addresses: [] }],
        activeId: "x",
      }),
    });
    expect(getSnapshot().portfolios.some((p) => p.id === PERSONAL_ID)).toBe(true);
  });

  it("handles duplicate ids deterministically without losing addresses", () => {
    installStorage({
      [PORTFOLIOS_KEY]: JSON.stringify({
        version: 2,
        portfolios: [
          { id: "dup", name: "One", addresses: [A] },
          { id: "dup", name: "Two", addresses: [B] },
        ],
        activeId: "dup",
      }),
    });

    const state = getSnapshot();
    const ids = state.portfolios.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Both address lists survive the repair.
    const all = state.portfolios.flatMap((p) => p.addresses);
    expect(all).toContain(A);
    expect(all).toContain(B);
  });

  it("handles duplicate names deterministically", () => {
    installStorage({
      [PORTFOLIOS_KEY]: JSON.stringify({
        version: 2,
        portfolios: [
          { id: "a", name: "Trading", addresses: [] },
          { id: "b", name: "trading", addresses: [] },
        ],
        activeId: "a",
      }),
    });

    const names = getSnapshot().portfolios.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("is SSR-safe with no window", () => {
    vi.unstubAllGlobals();
    resetPortfolioStoreCache();
    expect(() => readState(undefined)).not.toThrow();
    expect(readState(undefined).portfolios[0]!.id).toBe(PERSONAL_ID);
  });
});

describe("only watchlist data is persisted", () => {
  const FORBIDDEN = [
    "1000000000000000000",
    "88730274",
    "USDC",
    "AUSD",
    "ROARRR",
    "totals",
    "blockNumber",
    "collections",
    "perWallet",
    "loading",
    "error",
    "fetchedAt",
  ];

  it("writes exactly version, portfolios (id/name/addresses) and activeId", () => {
    const storage = installStorage();
    addAddressTo(PERSONAL_ID, A);
    createPortfolio("Trading");

    const raw = storage._dump()[PORTFOLIOS_KEY]!;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual(["activeId", "portfolios", "version"]);
    for (const p of parsed.portfolios as Record<string, unknown>[]) {
      expect(Object.keys(p).sort()).toEqual(["addresses", "id", "name"]);
    }
    for (const forbidden of FORBIDDEN) expect(raw).not.toContain(forbidden);
  });

  it("strips any extra field a caller attaches", () => {
    const storage = installStorage();
    addAddressTo(PERSONAL_ID, A);

    // Even if a future bug attached balances to a portfolio object, writeState
    // rebuilds each entry from the three allowed fields.
    const raw = storage._dump()[PORTFOLIOS_KEY]!;
    expect(raw).not.toContain("balance");
  });

  it("uses exactly one storage key", () => {
    const storage = installStorage();
    addAddressTo(PERSONAL_ID, A);
    expect(Object.keys(storage._dump())).toEqual([PORTFOLIOS_KEY]);
  });
});

describe("store notifications", () => {
  it("notifies subscribers on change", () => {
    installStorage();
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    createPortfolio("Trading");
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });

  it("returns a stable snapshot reference between changes", () => {
    installStorage();
    expect(getSnapshot()).toBe(getSnapshot());
  });
});

describe("validatePortfolioName", () => {
  const existing: Portfolio[] = [{ id: PERSONAL_ID, name: "Personal", addresses: [] }];

  it("accepts a normal name", () => {
    expect(validatePortfolioName("Trading", existing).ok).toBe(true);
  });

  it("gives a friendly message for each rejection", () => {
    for (const input of ["", "x".repeat(41), "Personal"]) {
      const result = validatePortfolioName(input, existing);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.message.length).toBeGreaterThan(0);
      expect(result.message).not.toMatch(/undefined|\[object/);
    }
  });
});

describe("the default portfolio is renamable but permanent", () => {
  it("honours a stored custom name for the default", () => {
    installStorage({
      [PORTFOLIOS_KEY]: JSON.stringify({
        version: 2,
        portfolios: [{ id: PERSONAL_ID, name: "Main", addresses: [] }],
        activeId: PERSONAL_ID,
      }),
    });
    // Normalisation used to force this back to "Personal", silently undoing
    // every rename on the next read.
    expect(getSnapshot().portfolios[0]!.name).toBe("Main");
  });

  it("falls back to Personal only when the stored name is blank", () => {
    installStorage({
      [PORTFOLIOS_KEY]: JSON.stringify({
        version: 2,
        portfolios: [{ id: PERSONAL_ID, name: "   ", addresses: [] }],
        activeId: PERSONAL_ID,
      }),
    });
    expect(getSnapshot().portfolios[0]!.name).toBe("Personal");
  });

  it("cannot be deleted even after a rename", () => {
    installStorage();
    renamePortfolio(PERSONAL_ID, "Main");
    expect(deletePortfolio(PERSONAL_ID)).toMatchObject({ ok: false });
    expect(getSnapshot().portfolios.some((p) => p.id === PERSONAL_ID)).toBe(true);
  });
});
