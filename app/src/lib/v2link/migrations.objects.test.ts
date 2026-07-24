import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrations";

/**
 * Verifies the exact database objects that scripts/setup-v2-staging-db.sh checks
 * for, against a real Postgres engine (PGlite). Keep this in lockstep with that
 * script's assertions.
 */
let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await migrate({
    async query(text: string, params: unknown[] = []) {
      const r = await db.query(text, params);
      return { rows: r.rows as never[], rowCount: r.rows.length };
    },
    async tx(fn) {
      return db.transaction(async (tx) => fn(tx as never)) as never;
    },
  });
});
afterEach(async () => {
  await db.close();
});

const scalar = async (sql: string): Promise<string> => {
  const r = await db.query(sql);
  const row = r.rows[0] as Record<string, unknown>;
  return String(Object.values(row)[0]);
};

describe("staging DB objects (matches setup-v2-staging-db.sh)", () => {
  it("creates every required table", async () => {
    for (const t of ["v2_challenges", "v2_indexer_cursor", "v2_scan_lease", "v2_rate_limits"]) {
      expect(await scalar(`select to_regclass('public.${t}') is not null as x`)).toBe("true");
    }
  });

  it("creates the four partial unique indexes and drops the old amount index", async () => {
    for (const i of [
      "v2_uniq_active_pair",
      "v2_uniq_active_recipient_amount",
      "v2_uniq_verifier_nonce",
      "v2_uniq_tx_hash",
    ]) {
      expect(await scalar(`select count(*) as x from pg_indexes where indexname='${i}'`)).toBe("1");
    }
    expect(await scalar(`select count(*) as x from pg_indexes where indexname='v2_uniq_active_amount'`)).toBe("0");
  });

  it("re-running migrate is idempotent", async () => {
    await expect(
      migrate({
        async query(text: string, params: unknown[] = []) {
          const r = await db.query(text, params);
          return { rows: r.rows as never[], rowCount: r.rows.length };
        },
        async tx(fn) {
          return db.transaction(async (tx) => fn(tx as never)) as never;
        },
      }),
    ).resolves.toBeUndefined();
    // Objects still intact after a second apply.
    expect(await scalar(`select count(*) as x from pg_indexes where indexname='v2_uniq_active_pair'`)).toBe("1");
  });

  it("seeds the scan lease and supports atomic acquire/hold/release", async () => {
    expect(await scalar(`select count(*) as x from v2_scan_lease where id=1`)).toBe("1");
    const acq1 = await db.query(
      `update v2_scan_lease set locked_until = extract(epoch from now())+30
        where id=1 and locked_until < extract(epoch from now()) returning id`,
    );
    const acq2 = await db.query(
      `update v2_scan_lease set locked_until = extract(epoch from now())+30
        where id=1 and locked_until < extract(epoch from now()) returning id`,
    );
    await db.query(`update v2_scan_lease set locked_until = 0 where id=1`);
    expect(acq1.rows.length).toBe(1); // acquired
    expect(acq2.rows.length).toBe(0); // blocked while held
  });

  it("rate-limit table uses double precision for updated_at", async () => {
    expect(
      await scalar(
        `select data_type as x from information_schema.columns
          where table_name='v2_rate_limits' and column_name='updated_at'`,
      ),
    ).toBe("double precision");
  });
});
