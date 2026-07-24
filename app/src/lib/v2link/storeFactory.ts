/**
 * Store selection.
 *
 * Dev/preview use the in-memory store (fine for a single process). PRODUCTION on
 * serverless MUST use a persistent, shared store — wire a Postgres adapter that
 * implements {ChallengeStore} against the schema in docs/verified-one-v2.md §3.4
 * and return it here when `DATABASE_URL` is set. The in-memory store does not
 * survive across serverless invocations, so leaving it in production means
 * challenges vanish between requests — hence the explicit guard.
 */

import { InMemoryChallengeStore, type ChallengeStore } from "./store";

let singleton: ChallengeStore | null = null;

export function getChallengeStore(): ChallengeStore {
  if (process.env.DATABASE_URL) {
    // Provisioning seam: construct and return your Postgres-backed ChallengeStore
    // here (e.g. new PostgresChallengeStore(process.env.DATABASE_URL)). Until that
    // adapter is added, fail loudly rather than silently losing state.
    throw new Error(
      "DATABASE_URL is set but no persistent ChallengeStore adapter is wired. " +
        "Add the Postgres adapter (docs/verified-one-v2.md §3.4) in storeFactory.ts.",
    );
  }
  if (!singleton) singleton = new InMemoryChallengeStore();
  return singleton;
}
