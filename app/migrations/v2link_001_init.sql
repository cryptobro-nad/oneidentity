-- Verified ONE V2 link schema.
-- Apply with:  psql "$DATABASE_URL" -f app/migrations/v2link_001_init.sql
-- Idempotent (IF NOT EXISTS), so re-running is safe. Rollback at the bottom.

create table if not exists v2_challenges (
  id                text primary key,               -- also the on-chain challengeId source
  primary_addr      text not null,                  -- lowercased
  secondary_addr    text not null,                  -- lowercased
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

create unique index if not exists v2_uniq_active_amount
  on v2_challenges (secondary_addr, primary_addr, amount_wei)
  where status in ('pending','verified');

create unique index if not exists v2_uniq_verifier_nonce on v2_challenges (verifier_nonce);

create unique index if not exists v2_uniq_tx_hash on v2_challenges (tx_hash)
  where tx_hash is not null;

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

-- ROLLBACK (destroys all V2 challenge state — irreversible):
--   drop table if exists v2_scan_lease;
--   drop table if exists v2_indexer_cursor;
--   drop table if exists v2_challenges;
