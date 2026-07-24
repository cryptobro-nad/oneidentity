#!/usr/bin/env bash
#
# setup-v2-staging-db.sh — apply and verify the Verified ONE V2 schema against a
# STAGING Neon Postgres database. Safe to re-run (migrations are idempotent).
#
# Usage:
#   export DATABASE_URL="postgres://…"        # staging only
#   export CONFIRM_STAGING_DATABASE=yes        # explicit staging confirmation
#   scripts/setup-v2-staging-db.sh
#
# Guarantees:
#   - refuses to run without DATABASE_URL
#   - refuses to run without CONFIRM_STAGING_DATABASE=yes
#   - never prints the connection string
#   - applies 001 then 002, then re-applies both to prove idempotency
#   - verifies every required table, the four partial unique indexes, the scan
#     lease (functionally) and the rate-limit table
#   - exits non-zero if anything is missing
#
# It only touches v2_* objects and cleans up its own probe rows.

set -euo pipefail

# --- Guards ------------------------------------------------------------------
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Refusing to run." >&2
  exit 2
fi
if [[ "${CONFIRM_STAGING_DATABASE:-}" != "yes" ]]; then
  echo "ERROR: set CONFIRM_STAGING_DATABASE=yes to confirm this is a STAGING database." >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found on PATH. Install the PostgreSQL client." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$SCRIPT_DIR/../app/migrations"
MIG_001="$MIG_DIR/v2link_001_init.sql"
MIG_002="$MIG_DIR/v2link_002_uniqueness_and_ratelimit.sql"
for f in "$MIG_001" "$MIG_002"; do
  [[ -f "$f" ]] || { echo "ERROR: migration file missing: $f" >&2; exit 2; }
done

# psql helpers. The URL is passed as an argument, never echoed. ON_ERROR_STOP
# makes any SQL error abort with a non-zero status.
apply() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -f "$1"; }
# scalar query → trimmed single value
scalar() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -t -A -c "$1"; }

fail=0
note() { printf '  %-46s %s\n' "$1" "$2"; }

echo "== Applying migrations (001, 002) =="
apply "$MIG_001"
apply "$MIG_002"
echo "== Re-applying to prove idempotency =="
apply "$MIG_001"
apply "$MIG_002"
echo "   idempotency OK (re-apply produced no error)"

echo "== Verifying tables =="
for t in v2_challenges v2_indexer_cursor v2_scan_lease v2_rate_limits; do
  present="$(scalar "select to_regclass('public.$t') is not null;")"
  if [[ "$present" == "t" ]]; then note "table $t" "OK"; else note "table $t" "MISSING"; fail=1; fi
done

echo "== Verifying partial unique indexes =="
for i in v2_uniq_active_pair v2_uniq_active_recipient_amount v2_uniq_verifier_nonce v2_uniq_tx_hash; do
  cnt="$(scalar "select count(*) from pg_indexes where schemaname='public' and indexname='$i';")"
  if [[ "$cnt" == "1" ]]; then note "index $i" "OK"; else note "index $i" "MISSING"; fail=1; fi
done

echo "== Verifying old amount-scoped index is gone =="
old="$(scalar "select count(*) from pg_indexes where indexname='v2_uniq_active_amount';")"
if [[ "$old" == "0" ]]; then note "index v2_uniq_active_amount removed" "OK"; else note "v2_uniq_active_amount" "STILL PRESENT"; fail=1; fi

echo "== Verifying scan lease (functional) =="
# Seed row must exist.
seed="$(scalar "select count(*) from v2_scan_lease where id=1;")"
[[ "$seed" == "1" ]] || { note "scan lease seed row" "MISSING"; fail=1; }
# Atomic acquire must succeed once, then be blocked while held, then release.
acq1="$(scalar "update v2_scan_lease set locked_until = extract(epoch from now())+30 where id=1 and locked_until < extract(epoch from now()) returning id;" | grep -c '^1$' || true)"
acq2="$(scalar "update v2_scan_lease set locked_until = extract(epoch from now())+30 where id=1 and locked_until < extract(epoch from now()) returning id;" | grep -c '^1$' || true)"
scalar "update v2_scan_lease set locked_until = 0 where id=1;" >/dev/null
if [[ "$acq1" == "1" && "$acq2" == "0" ]]; then
  note "scan lease acquire/hold/release" "OK"
else
  note "scan lease acquire/hold/release" "FAILED (acq1=$acq1 acq2=$acq2)"; fail=1
fi

echo "== Verifying rate-limit table (functional) =="
# updated_at must be double precision (fractional seconds), tokens double.
coltype="$(scalar "select data_type from information_schema.columns where table_name='v2_rate_limits' and column_name='updated_at';")"
[[ "$coltype" == "double precision" ]] || { note "v2_rate_limits.updated_at type" "WRONG ($coltype)"; fail=1; }
# Probe row insert + cleanup delete round-trip (marked bucket, then removed).
scalar "insert into v2_rate_limits(bucket,tokens,updated_at) values('__probe__',1,extract(epoch from now())) on conflict(bucket) do update set tokens=1;" >/dev/null
present="$(scalar "select count(*) from v2_rate_limits where bucket='__probe__';")"
scalar "delete from v2_rate_limits where bucket='__probe__';" >/dev/null
gone="$(scalar "select count(*) from v2_rate_limits where bucket='__probe__';")"
if [[ "$present" == "1" && "$gone" == "0" ]]; then
  note "rate-limit upsert + cleanup" "OK"
else
  note "rate-limit upsert + cleanup" "FAILED"; fail=1
fi

echo "-------------------------------------------------------"
if [[ "$fail" -eq 0 ]]; then
  echo "RESULT: staging V2 schema present and functional."
  exit 0
else
  echo "RESULT: one or more checks FAILED (see above)." >&2
  exit 1
fi
