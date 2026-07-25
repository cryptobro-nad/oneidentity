// Verified ONE V2 — staging migration runner (no psql required).
//
// The no-psql, Windows-friendly equivalent of scripts/setup-v2-staging-db.sh.
// It drives the repo's OWN migrate() (app/src/lib/v2link/migrations.ts), which
// splits each migration into single statements and runs them one at a time
// through the Neon HTTP driver — so the "cannot insert multiple commands into a
// prepared statement" error cannot occur, and no SQL is split by hand.
//
// Usage (from the app/ directory, in Git Bash or PowerShell):
//   export DATABASE_URL='…staging…'        # your terminal only, never in chat
//   export CONFIRM_STAGING_DATABASE=yes
//   node scripts/migrate-staging.mjs
//
// Guarantees: refuses to run without DATABASE_URL and CONFIRM_STAGING_DATABASE=yes;
// never prints the connection string; verifies all tables, the four partial
// unique indexes, removal of the old amount index, the scan lease and the
// rate-limit table; exits non-zero if anything is missing.

import { neon } from "@neondatabase/serverless";
import { migrate } from "../src/lib/v2link/migrations.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL is not set. Refusing to run.");
  process.exit(2);
}
if (process.env.CONFIRM_STAGING_DATABASE !== "yes") {
  console.error("ERROR: set CONFIRM_STAGING_DATABASE=yes to confirm this is a STAGING database.");
  process.exit(2);
}

// Neon HTTP: one statement per request, fullResults so we get { rows, rowCount }.
const q = neon(url, { fullResults: true });
const sql = {
  async query(text, params = []) {
    const r = await q.query(text, params);
    return { rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows ? r.rows.length : 0) };
  },
  async tx(fn) {
    // migrate() does not use tx(); this stub keeps the Sql shape complete.
    return fn(this);
  },
};

const scalar = async (text) => String(Object.values((await sql.query(text)).rows[0] ?? {})[0]);
let fail = 0;
const note = (label, ok, extra = "") =>
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${label}${extra ? "  " + extra : ""}`) || (ok ? 0 : (fail = 1));

try {
  console.log("== Applying migrations (001, 002) via migrate() ==");
  await migrate(sql);
  console.log("   applied");

  console.log("== Re-applying to prove idempotency ==");
  await migrate(sql);
  console.log("   idempotency OK (re-apply produced no error)");

  console.log("== Verifying tables ==");
  for (const t of ["v2_challenges", "v2_indexer_cursor", "v2_scan_lease", "v2_rate_limits"]) {
    note(`table ${t}`, (await scalar(`select to_regclass('public.${t}') is not null as x`)) === "true");
  }

  console.log("== Verifying partial unique indexes ==");
  for (const i of ["v2_uniq_active_pair", "v2_uniq_active_recipient_amount", "v2_uniq_verifier_nonce", "v2_uniq_tx_hash"]) {
    note(`index ${i}`, (await scalar(`select count(*) as x from pg_indexes where indexname='${i}'`)) === "1");
  }
  note(
    "old index v2_uniq_active_amount removed",
    (await scalar(`select count(*) as x from pg_indexes where indexname='v2_uniq_active_amount'`)) === "0",
  );

  console.log("== Verifying scan lease (functional) ==");
  note("scan lease seed row", (await scalar(`select count(*) as x from v2_scan_lease where id=1`)) === "1");
  const acq1 = (await sql.query(
    `update v2_scan_lease set locked_until = extract(epoch from now())+30
       where id=1 and locked_until < extract(epoch from now()) returning id`,
  )).rows.length;
  const acq2 = (await sql.query(
    `update v2_scan_lease set locked_until = extract(epoch from now())+30
       where id=1 and locked_until < extract(epoch from now()) returning id`,
  )).rows.length;
  await sql.query(`update v2_scan_lease set locked_until = 0 where id=1`);
  note("scan lease acquire/hold/release", acq1 === 1 && acq2 === 0, `(acq1=${acq1} acq2=${acq2})`);

  console.log("== Verifying rate-limit table ==");
  const coltype = await scalar(
    `select data_type as x from information_schema.columns
       where table_name='v2_rate_limits' and column_name='updated_at'`,
  );
  note("v2_rate_limits.updated_at is double precision", coltype === "double precision", `(${coltype})`);

  console.log("-------------------------------------------------------");
  if (fail === 0) {
    console.log("RESULT: staging V2 schema present and functional.");
    process.exit(0);
  } else {
    console.error("RESULT: one or more checks FAILED (see above).");
    process.exit(1);
  }
} catch (err) {
  // Redact anything that looks like the connection string from the error.
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[connection string redacted]");
  console.error("ERROR while migrating:", msg);
  process.exit(1);
}
