/**
 * Shared database handle. One Neon pool per serverless instance, reused by the
 * challenge store and the rate limiter so they don't open competing pools.
 * Returns null when DATABASE_URL is unset (local dev / preview without a DB).
 */

import { neonSql, type Sql } from "./sql";

let cached: Sql | null = null;
let cachedUrl: string | null = null;

export function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!cached || cachedUrl !== url) {
    cached = neonSql(url);
    cachedUrl = url;
  }
  return cached;
}
