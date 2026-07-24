/**
 * Lightweight in-memory token-bucket rate limiter.
 *
 * Per serverless instance (not global), so it is a defense-in-depth throttle,
 * not a hard quota — the real single-use / one-active-per-pair guarantees live in
 * the DB and the contract. It exists to blunt bursts (poll floods, challenge
 * spam) cheaply without a round-trip.
 */

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  capacity: number; // burst size
  refillPerSec: number; // sustained rate
  now?: number; // seconds; injectable for tests
};

export function rateLimit(key: string, opts: RateLimitOptions): boolean {
  const now = opts.now ?? Date.now() / 1000;
  if (buckets.size > 50_000) buckets.clear(); // bound memory; coarse but safe
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: opts.capacity, updated: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(opts.capacity, b.tokens + (now - b.updated) * opts.refillPerSec);
  b.updated = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/** Derives a per-caller key from the forwarded client IP. */
export function clientKey(req: Request, scope: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${scope}:${ip}`;
}

/** Test-only reset. */
export function __resetRateLimits(): void {
  buckets.clear();
}
