import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PostgresRateLimiter } from "./rateLimit";
import { migrate } from "./migrations";
import type { Sql } from "./sql";

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

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await migrate(pgliteSql(db));
});
afterEach(async () => {
  await db.close();
});

describe("PostgresRateLimiter (PGlite)", () => {
  it("allows up to capacity then denies with retry timing", async () => {
    const rl = new PostgresRateLimiter(pgliteSql(db));
    const opts = { capacity: 3, refillPerSec: 0.5, now: 1000 };
    expect((await rl.check("b", opts)).allowed).toBe(true);
    expect((await rl.check("b", opts)).allowed).toBe(true);
    expect((await rl.check("b", opts)).allowed).toBe(true);
    const denied = await rl.check("b", opts);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("refills over elapsed time", async () => {
    const rl = new PostgresRateLimiter(pgliteSql(db));
    expect((await rl.check("b", { capacity: 1, refillPerSec: 1, now: 1000 })).allowed).toBe(true);
    expect((await rl.check("b", { capacity: 1, refillPerSec: 1, now: 1000 })).allowed).toBe(false);
    expect((await rl.check("b", { capacity: 1, refillPerSec: 1, now: 1001 })).allowed).toBe(true);
  });

  it("shares one limit across independent limiter instances (no process memory)", async () => {
    // Two limiter instances = two 'serverless instances' backed by the same DB.
    const a = new PostgresRateLimiter(pgliteSql(db));
    const c = new PostgresRateLimiter(pgliteSql(db));
    const opts = { capacity: 2, refillPerSec: 0, now: 1000 };
    expect((await a.check("shared", opts)).allowed).toBe(true); // token 2 → 1
    expect((await c.check("shared", opts)).allowed).toBe(true); // token 1 → 0, via the OTHER instance
    expect((await a.check("shared", opts)).allowed).toBe(false); // exhausted globally
  });

  it("admits exactly capacity under a burst of concurrent requests", async () => {
    const rl = new PostgresRateLimiter(pgliteSql(db));
    const opts = { capacity: 5, refillPerSec: 0, now: 1000 };
    const results = await Promise.all(Array.from({ length: 12 }, () => rl.check("burst", opts)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("cleanup deletes idle buckets so they reset", async () => {
    const rl = new PostgresRateLimiter(pgliteSql(db));
    const opts = { capacity: 1, refillPerSec: 0, now: 1000 };
    expect((await rl.check("x", opts)).allowed).toBe(true);
    expect((await rl.check("x", opts)).allowed).toBe(false); // exhausted
    await rl.cleanup(2000); // deletes rows with updated_at < 2000
    expect((await rl.check("x", { ...opts, now: 3000 })).allowed).toBe(true); // fresh row
  });
});
