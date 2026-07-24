import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PostgresChallengeStore } from "./postgresStore";
import { migrate } from "./migrations";
import type { Sql } from "./sql";
import type { Challenge } from "./types";
import type { PortfolioAddress } from "@/lib/types";

const PRIMARY = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const SECONDARY = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

/** PGlite-backed Sql — a real in-process Postgres. */
function pgliteSql(db: PGlite): Sql {
  const wrap = (exec: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql => ({
    async query<T>(text: string, params: unknown[] = []) {
      const r = await exec.query(text, params);
      return { rows: r.rows as T[], rowCount: r.rows.length };
    },
    async tx<T>(fn: (sql: Sql) => Promise<T>) {
      return db.transaction(async (tx) => fn(wrap(tx as never))) as Promise<T>;
    },
  });
  return wrap(db);
}

const chal = (over: Partial<Challenge> = {}): Challenge => ({
  id: "c1",
  primary: PRIMARY,
  secondary: SECONDARY,
  amountWei: "15000000000000000",
  createdAt: 1000,
  createdAtBlock: 100n,
  expiresAt: 1300,
  status: "pending",
  verifierNonce: 1n,
  ...over,
});

let db: PGlite;
let store: PostgresChallengeStore;

beforeEach(async () => {
  db = new PGlite();
  await migrate(pgliteSql(db));
  store = new PostgresChallengeStore(pgliteSql(db));
});
afterEach(async () => {
  await db.close();
});

describe("PostgresChallengeStore (PGlite)", () => {
  it("round-trips a challenge with checksummed addresses", async () => {
    await store.create(chal());
    const got = await store.get("c1");
    expect(got?.primary).toBe(PRIMARY); // checksummed on read
    expect(got?.amountWei).toBe("15000000000000000");
    expect(got?.verifierNonce).toBe(1n);
    expect(got?.status).toBe("pending");
  });

  it("rejects a duplicate active amount for the same pair", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    await expect(store.create(chal({ id: "b", verifierNonce: 2n }))).rejects.toThrow();
  });

  it("rejects a duplicate verifier nonce", async () => {
    await store.create(chal({ id: "a", amountWei: "15000000000000000", verifierNonce: 7n }));
    await expect(
      store.create(chal({ id: "b", amountWei: "16000000000000000", verifierNonce: 7n })),
    ).rejects.toThrow();
  });

  it("enforces single-use of a transfer hash", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    await store.create(chal({ id: "b", amountWei: "16000000000000000", verifierNonce: 2n }));
    await store.update({ ...(await store.get("a"))!, status: "verified", txHash: "0xdead", txBlock: 110n });
    // A second challenge cannot record the same transfer.
    await expect(
      store.update({ ...(await store.get("b"))!, status: "verified", txHash: "0xdead", txBlock: 111n }),
    ).rejects.toThrow();
  });

  it("finds the active challenge for a pair and excludes expired ones", async () => {
    await store.create(chal({ id: "a", expiresAt: 1300, verifierNonce: 1n }));
    expect((await store.findActiveForPair(SECONDARY, PRIMARY, 1200))?.id).toBe("a");
    expect(await store.findActiveForPair(SECONDARY, PRIMARY, 1400)).toBeNull(); // expired
  });

  it("matches by recipient + exact amount", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    const m = await store.findMatchable(PRIMARY, "15000000000000000");
    expect(m.map((c) => c.id)).toEqual(["a"]);
    expect(await store.findMatchable(PRIMARY, "1")).toEqual([]);
  });

  it("persists the cursor across a restart", async () => {
    await store.setCursor(500n, "0x500");
    const fresh = new PostgresChallengeStore(pgliteSql(db)); // new instance, same db
    expect(await fresh.getCursor()).toEqual({ block: 500n, hash: "0x500" });
  });

  it("gives the scan lease to one holder at a time", async () => {
    expect(await store.tryAcquireScanLease(1000, 30)).toBe(true);
    expect(await store.tryAcquireScanLease(1000, 30)).toBe(false); // held
    expect(await store.tryAcquireScanLease(1031, 30)).toBe(true); // expired → reacquire
    await store.releaseScanLease();
    expect(await store.tryAcquireScanLease(1035, 30)).toBe(true); // released
  });
});
