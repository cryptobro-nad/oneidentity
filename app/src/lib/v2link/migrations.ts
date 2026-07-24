/**
 * V2 link schema. Idempotent (IF NOT EXISTS), so `migrate` is safe to run on
 * every boot and in tests. See docs/verified-one-v2.md for rollback.
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

/**
 * Individual statements. Postgres' extended protocol (used by both PGlite and
 * node-postgres parameterised queries) rejects multiple commands in one query,
 * so we run them one at a time. Splitting on `;` is safe here: no statement
 * body contains a semicolon inside a string literal.
 */
export const MIGRATION_001_STATEMENTS = MIGRATION_001.split(";")
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((s) => s.length > 0);

export async function migrate(sql: Sql): Promise<void> {
  for (const stmt of MIGRATION_001_STATEMENTS) {
    await sql.query(stmt);
  }
}
