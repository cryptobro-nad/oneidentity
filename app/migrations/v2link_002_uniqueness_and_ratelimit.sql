-- Verified ONE V2 — migration 002.
-- Apply AFTER 001:  psql "$DATABASE_URL" -f app/migrations/v2link_002_uniqueness_and_ratelimit.sql
-- Idempotent. Rollback at the bottom.
--
-- (1) Fix active-challenge uniqueness: one active challenge per (secondary,
--     primary) REGARDLESS of amount — each retry mints a new amount, so an
--     amount-scoped rule wrongly permitted several simultaneous active
--     challenges for one pair. A second index keeps the amount unique per
--     recipient so the (recipient, amount) transfer match stays unambiguous.
-- (2) Add DB-backed rate limiting shared across serverless instances.

-- (1) ------------------------------------------------------------------------
drop index if exists v2_uniq_active_amount;

create unique index if not exists v2_uniq_active_pair
  on v2_challenges (secondary_addr, primary_addr)
  where status in ('pending','verified');

create unique index if not exists v2_uniq_active_recipient_amount
  on v2_challenges (primary_addr, amount_wei)
  where status in ('pending','verified');

-- (2) ------------------------------------------------------------------------
create table if not exists v2_rate_limits (
  bucket     text primary key,          -- e.g. "challenge:ip:1.2.3.4" or "challenge:primary:0x…"
  tokens     double precision not null,
  updated_at double precision not null  -- unix seconds; fractional allowed
);
create index if not exists v2_rate_limits_updated_idx on v2_rate_limits (updated_at);

-- ROLLBACK (restores the amount-scoped rule; drops rate limiting):
--   drop table if exists v2_rate_limits;
--   drop index if exists v2_uniq_active_recipient_amount;
--   drop index if exists v2_uniq_active_pair;
--   create unique index if not exists v2_uniq_active_amount
--     on v2_challenges (secondary_addr, primary_addr, amount_wei)
--     where status in ('pending','verified');
