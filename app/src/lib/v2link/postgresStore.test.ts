import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PostgresChallengeStore } from "./postgresStore";
import { UniqueViolation, CONSTRAINT } from "./store";
import { migrate } from "./migrations";
import type { Sql } from "./sql";
import type { Challenge } from "./types";
import type { PortfolioAddress } from "@/lib/types";

const PRIMARY = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const SECONDARY = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;
const SECONDARY2 = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946" as PortfolioAddress;
const PRIMARY2 = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4" as PortfolioAddress;

/** Captures the constraint name a create/update violated. */
async function constraintFrom(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof UniqueViolation) return err.constraint;
    throw err;
  }
  throw new Error("expected a UniqueViolation");
}

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

  it("rejects a second active challenge for the same pair, regardless of amount", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    // Different amount + nonce, same pair → still blocked (one active per pair).
    const constraint = await constraintFrom(() =>
      store.create(chal({ id: "b", amountWei: "16000000000000000", verifierNonce: 2n })),
    );
    expect(constraint).toBe(CONSTRAINT.ACTIVE_PAIR);
  });

  it("rejects a duplicate verifier nonce across different pairs", async () => {
    await store.create(chal({ id: "a", verifierNonce: 7n }));
    const constraint = await constraintFrom(() =>
      // Different pair (so the active-pair index allows it) but the same nonce.
      store.create(chal({ id: "b", secondary: SECONDARY2, amountWei: "16000000000000000", verifierNonce: 7n })),
    );
    expect(constraint).toBe(CONSTRAINT.VERIFIER_NONCE);
  });

  it("rejects the same active amount to one recipient across different pairs", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    const constraint = await constraintFrom(() =>
      // Different secondary but same primary + same amount → ambiguous match, blocked.
      store.create(chal({ id: "b", secondary: SECONDARY2, verifierNonce: 2n })),
    );
    expect(constraint).toBe(CONSTRAINT.RECIPIENT_AMOUNT);
  });

  it("enforces single-use of a transfer hash", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    await store.create(chal({ id: "b", secondary: SECONDARY2, amountWei: "16000000000000000", verifierNonce: 2n }));
    await store.update({ ...(await store.get("a"))!, status: "verified", txHash: "0xdead", txBlock: 110n });
    // A second challenge cannot record the same transfer.
    const b = (await store.get("b"))!;
    const constraint = await constraintFrom(() =>
      store.update({ ...b, status: "verified", txHash: "0xdead", txBlock: 111n }),
    );
    expect(constraint).toBe(CONSTRAINT.TX_HASH);
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

describe("active-challenge uniqueness (one per pair)", () => {
  const differentAmount = (i: number) => (16000000000000000n + BigInt(i) * 1000000000000n).toString();

  it("two concurrent creates for the same pair: one succeeds, one conflicts", async () => {
    // Fire both inserts at once; the partial unique index arbitrates.
    const results = await Promise.allSettled([
      store.create(chal({ id: "a", amountWei: differentAmount(1), verifierNonce: 1n })),
      store.create(chal({ id: "b", amountWei: differentAmount(2), verifierNonce: 2n })),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toBeInstanceOf(UniqueViolation);
    expect((failed[0]!.reason as UniqueViolation).constraint).toBe(CONSTRAINT.ACTIVE_PAIR);
  });

  it("allows a new attempt after the previous expired", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    await store.update({ ...(await store.get("a"))!, status: "expired" });
    await expect(store.create(chal({ id: "b", verifierNonce: 2n }))).resolves.toBeUndefined();
  });

  it("allows a new attempt after cancellation", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    await store.cancel("a");
    expect((await store.get("a"))?.status).toBe("cancelled");
    await expect(store.create(chal({ id: "b", verifierNonce: 2n }))).resolves.toBeUndefined();
  });

  it("allows a new attempt after successful consumption (linked)", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    await store.update({ ...(await store.get("a"))!, status: "linked", linkedAt: 1250 });
    await expect(store.create(chal({ id: "b", verifierNonce: 2n }))).resolves.toBeUndefined();
  });

  it("markLinked frees a verified pair so relinking starts fresh (not 'approve')", async () => {
    await store.create(chal({ id: "a", verifierNonce: 1n }));
    // Simulate detection: verified, within a live 10-min approval window.
    await store.update({
      ...(await store.get("a"))!,
      status: "verified",
      txHash: "0xfeed",
      txBlock: 120n,
      verifiedAt: 1200,
      approvalDeadline: 1800,
    });
    // Before markLinked, the verified challenge is still returned as active
    // (this was the relink bug — the UI resumed the old approval).
    expect((await store.findActiveForPair(SECONDARY, PRIMARY, 1300))?.id).toBe("a");
    await store.markLinked("a");
    expect((await store.get("a"))?.status).toBe("linked");
    // Now it is terminal → a fresh link of the same pair is allowed.
    expect(await store.findActiveForPair(SECONDARY, PRIMARY, 1300)).toBeNull();
    await expect(store.create(chal({ id: "b", verifierNonce: 2n }))).resolves.toBeUndefined();
  });

  it("allows different secondaries under the same primary (distinct amounts)", async () => {
    await store.create(chal({ id: "a", secondary: SECONDARY, amountWei: differentAmount(1), verifierNonce: 1n }));
    await expect(
      store.create(chal({ id: "b", secondary: SECONDARY2, amountWei: differentAmount(2), verifierNonce: 2n })),
    ).resolves.toBeUndefined();
  });

  it("allows the same secondary linking to different primaries", async () => {
    await store.create(chal({ id: "a", primary: PRIMARY, secondary: SECONDARY, verifierNonce: 1n }));
    await expect(
      store.create(chal({ id: "b", primary: PRIMARY2, secondary: SECONDARY, verifierNonce: 2n })),
    ).resolves.toBeUndefined();
  });
});
