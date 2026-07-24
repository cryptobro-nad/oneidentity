/**
 * V2 link schema, applied in order. Idempotent (IF NOT EXISTS / IF EXISTS), so
 * `migrate` is safe to run on every boot and in tests. The `.sql` files under
 * app/migrations mirror these strings and are the canonical psql artifacts; keep
 * the two in sync. See docs/verified-one-v2.md for rollback.
 *
 * Migration 001 shipped an amount-scoped active-uniqueness index; 002 replaces
 * it (see the file header) and adds the rate-limit table. 002 is additive/
 * forward-only rather than an edit to 001, so any environment that already ran
 * 001 migrates cleanly.
 */

import type { Sql } from "./sql";

export const MIGRATION_001 = `
create table if not exists v2_challenges (
  id                text primary key,               -- also the on-chain challengeId source
  primary_addr      text not null,                  -- stored lowercased
  secondary_addr    text not null,                  -- stored lowercased
  amount_wei        numeric(78,0) not null,
  created_at        bigint not null,                -- unix seconds
  created_at_block  bigint not null,
  expires_at        bigint not null,
  status            text not null default 'pending',-- pending|verified|linked|expired
  tx_hash           text,
  tx_block          bigint,
  verified_at       bigint,
  approval_deadline bigint,
  linked_at         bigint,
  verifier_nonce    numeric(78,0) not null
);

-- One active amount per pair (prevents matching an unrelated equal transfer).
create unique index if not exists v2_uniq_active_amount
  on v2_challenges (secondary_addr, primary_addr, amount_wei)
  where status in ('pending','verified');

-- Verifier nonce is globally unique.
create unique index if not exists v2_uniq_verifier_nonce on v2_challenges (verifier_nonce);

-- A transfer transaction backs at most one verification (single-use).
create unique index if not exists v2_uniq_tx_hash on v2_challenges (tx_hash)
  where tx_hash is not null;

-- Fast matcher lookup.
create index if not exists v2_idx_matchable on v2_challenges (primary_addr, amount_wei)
  where status = 'pending';

create table if not exists v2_indexer_cursor (
  id                 int primary key,
  last_scanned_block bigint not null,
  last_scanned_hash  text
);

create table if not exists v2_scan_lease (
  id           int primary key,
  locked_until bigint not null default 0,
  holder       text
);
insert into v2_scan_lease (id, locked_until) values (1, 0) on conflict (id) do nothing;
`;

export const MIGRATION_002 = `
-- Replace amount-scoped active uniqueness with pair-scoped uniqueness (one active
-- challenge per pair regardless of amount) plus a per-recipient amount index.
drop index if exists v2_uniq_active_amount;

create unique index if not exists v2_uniq_active_pair
  on v2_challenges (secondary_addr, primary_addr)
  where status in ('pending','verified');

create unique index if not exists v2_uniq_active_recipient_amount
  on v2_challenges (primary_addr, amount_wei)
  where status in ('pending','verified');

-- DB-backed rate limiting, shared across serverless instances.
create table if not exists v2_rate_limits (
  bucket     text primary key,
  tokens     double precision not null,
  updated_at double precision not null   -- unix seconds; fractional allowed
);
create index if not exists v2_rate_limits_updated_idx on v2_rate_limits (updated_at);
`;

/** Ordered migrations. Appending a new one is the only supported way to evolve
 *  the schema; never edit a shipped migration in place. */
export const MIGRATIONS = [MIGRATION_001, MIGRATION_002] as const;

/**
 * Splits a migration into individual statements. Postgres' extended protocol
 * (used by both PGlite and node-postgres parameterised queries) rejects multiple
 * commands in one query, so we run them one at a time.
 *
 * Line comments are stripped FIRST (whole-line and inline `-- …`), so a `;`
 * inside a comment can't be mistaken for a statement terminator. No statement
 * body contains a semicolon inside a string literal, so splitting on `;` is then
 * safe.
 */
export function toStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function migrate(sql: Sql): Promise<void> {
  for (const migration of MIGRATIONS) {
    for (const stmt of toStatements(migration)) {
      await sql.query(stmt);
    }
  }
}
