/**
 * Store selection.
 *
 * Production (Vercel + Neon): when DATABASE_URL is set, the Postgres store is
 * used — there is NO silent fallback to in-memory (the in-memory store does not
 * survive serverless invocations). Dev/preview without DATABASE_URL use the
 * in-memory store. Run the migration (docs/verified-one-v2.md §5) before first
 * use; the store construction does not migrate.
 */

import { InMemoryChallengeStore, type ChallengeStore } from "./store";
import { PostgresChallengeStore } from "./postgresStore";
import { neonSql } from "./sql";

let pgStore: ChallengeStore | null = null;
let memStore: ChallengeStore | null = null;

export function getChallengeStore(): ChallengeStore {
  const url = process.env.DATABASE_URL;
  if (url) {
    if (!pgStore) pgStore = new PostgresChallengeStore(neonSql(url));
    return pgStore;
  }
  if (!memStore) memStore = new InMemoryChallengeStore();
  return memStore;
}
