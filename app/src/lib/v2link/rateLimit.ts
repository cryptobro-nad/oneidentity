/**
 * Rate limiting.
 *
 * Production routes MUST use the Postgres limiter: Vercel serverless instances
 * do not share process memory, so an in-memory counter is trivially bypassed by
 * hitting different instances. The in-memory limiter remains only as a local-dev
 * convenience (no DB needed). The factory picks Postgres whenever DATABASE_URL is
 * set — the same rule as the challenge store.
 *
 * Both implement an atomic token bucket. The Postgres version does it in a single
 * UPSERT so concurrent requests to the same bucket are serialised by a row lock,
 * giving one global limit regardless of how many instances are serving.
 *
 * The hard correctness guarantees (single-use, one-active-per-pair) live in the
 * DB unique indexes and the contract; rate limiting is defense-in-depth, so on a
 * limiter error we fail OPEN (allow) rather than DoS ourselves.
 */

import { getSql } from "./db";
import type { Sql } from "./sql";

export type RateLimitOptions = {
  capacity: number; // burst size (tokens)
  refillPerSec: number; // sustained rate (tokens/second)
  now?: number; // unix seconds; injectable for tests
};

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export interface RateLimiter {
  check(bucket: string, opts: RateLimitOptions): Promise<RateLimitResult>;
  /** Deletes buckets untouched since `before` (they have refilled to full, so
   *  removal is equivalent to a reset). Optional; called opportunistically. */
  cleanup(before: number): Promise<void>;
}

const nowSec = (opts: RateLimitOptions) => opts.now ?? Date.now() / 1000;
const retryAfter = (tokens: number, refillPerSec: number) =>
  refillPerSec <= 0 ? 60 : Math.max(1, Math.ceil((1 - tokens) / refillPerSec));

/** In-memory token bucket. Local dev only — NOT valid across instances. */
export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  async check(bucket: string, opts: RateLimitOptions): Promise<RateLimitResult> {
    const now = nowSec(opts);
    if (this.buckets.size > 50_000) this.buckets.clear();
    let b = this.buckets.get(bucket);
    if (!b) {
      b = { tokens: opts.capacity, updated: now };
      this.buckets.set(bucket, b);
    }
    b.tokens = Math.min(opts.capacity, b.tokens + (now - b.updated) * opts.refillPerSec);
    b.updated = now;
    if (b.tokens < 1) return { allowed: false, retryAfterSeconds: retryAfter(b.tokens, opts.refillPerSec) };
    b.tokens -= 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async cleanup(before: number): Promise<void> {
    for (const [k, v] of this.buckets) if (v.updated < before) this.buckets.delete(k);
  }

  reset(): void {
    this.buckets.clear();
  }
}

/** Postgres token bucket — atomic, shared across all serverless instances. */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly sql: Sql) {}

  async check(bucket: string, opts: RateLimitOptions): Promise<RateLimitResult> {
    const now = nowSec(opts);
    const { capacity, refillPerSec } = opts;
    try {
      // One atomic statement. On first sight the row is inserted with capacity-1
      // tokens (allowed). On a repeat the row is refilled and decremented, but
      // ONLY if it has >= 1 token after refill; otherwise the conditional UPDATE
      // matches nothing and no row is returned (denied). The ON CONFLICT path
      // takes a row lock, serialising concurrent requests to this bucket.
      // All params cast to double precision: `updated_at` is double, and without
      // the casts Postgres infers $4 (a fractional refill) as bigint and rejects
      // it. `refilled` = min(capacity, current tokens + elapsed * refill).
      const refilled =
        `least($2::double precision, v2_rate_limits.tokens + ` +
        `($3::double precision - v2_rate_limits.updated_at) * $4::double precision)`;
      const { rows } = await this.sql.query<{ tokens: number }>(
        `insert into v2_rate_limits (bucket, tokens, updated_at)
         values ($1, $2::double precision - 1, $3::double precision)
         on conflict (bucket) do update
           set tokens = ${refilled} - 1,
               updated_at = $3::double precision
           where ${refilled} >= 1
         returning tokens`,
        [bucket, capacity, now, refillPerSec],
      );
      if (rows[0]) return { allowed: true, retryAfterSeconds: 0 };

      // Denied: read the current level to estimate when a token returns.
      const { rows: cur } = await this.sql.query<{ tokens: number; updated_at: number }>(
        `select tokens, updated_at from v2_rate_limits where bucket = $1`,
        [bucket],
      );
      const level = cur[0]
        ? Math.min(capacity, Number(cur[0].tokens) + (now - Number(cur[0].updated_at)) * refillPerSec)
        : 0;
      return { allowed: false, retryAfterSeconds: retryAfter(level, refillPerSec) };
    } catch {
      // Limiter unavailable → fail open (the DB indexes still protect correctness).
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  async cleanup(before: number): Promise<void> {
    try {
      await this.sql.query(`delete from v2_rate_limits where updated_at < $1::double precision`, [before]);
    } catch {
      /* best effort */
    }
  }
}

let devLimiter: InMemoryRateLimiter | null = null;
let pgLimiter: PostgresRateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  const sql = getSql();
  if (sql) {
    if (!pgLimiter) pgLimiter = new PostgresRateLimiter(sql);
    return pgLimiter;
  }
  if (!devLimiter) devLimiter = new InMemoryRateLimiter();
  return devLimiter;
}

/**
 * The client IP, trusting only platform-set headers. On Vercel `x-real-ip` is set
 * by the proxy to the real client address and cannot be spoofed by the client, so
 * it is preferred. A client-supplied `x-forwarded-for` is never trusted on its
 * own; its first entry is used only as a local-dev fallback when `x-real-ip` is
 * absent. Identity-based limits (by primary address) do not depend on the IP.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}
