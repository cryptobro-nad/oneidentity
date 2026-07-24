import { NextResponse } from "next/server";
import { getChallengeStore } from "@/lib/v2link/storeFactory";
import { runIndexerTick } from "@/lib/v2link/indexer";
import { makeMonadIndexerClient } from "@/lib/v2link/indexerClient";
import { DEFAULT_CONFIRMATIONS } from "@/lib/v2link/types";
import { getRateLimiter } from "@/lib/v2link/rateLimit";
import { tooManyRequests } from "@/lib/v2link/http";
import { safeErrorMessage } from "@/lib/v2link/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rate-limit rows idle longer than this have refilled to full; safe to delete. */
const RATE_LIMIT_TTL_SECONDS = 3600;

/**
 * Indexer tick — scan confirmed blocks and mark matching challenges verified.
 * Scheduled via Vercel Cron (1/min). Authorised by CRON_SECRET. No user input.
 * The scan holds a DB-backed lease, so a cron run overlapping a polling-triggered
 * scan never double-processes a block.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: an unauthenticated indexer must never run in production.
    return NextResponse.json({ error: "Indexer is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const limiter = getRateLimiter();

  // Bound indexer execution independently of public request limits (a single
  // global bucket). The scan lease already serialises overlapping runs; this caps
  // how often the tick itself fires even if the schedule misbehaves.
  const gate = await limiter.check("indexer:global", { capacity: 3, refillPerSec: 0.05, now });
  if (!gate.allowed) return tooManyRequests(gate.retryAfterSeconds);

  // Opportunistically evict fully-refilled rate-limit rows (cleanup strategy).
  await limiter.cleanup(now - RATE_LIMIT_TTL_SECONDS);

  const confirmations = Number(process.env.INDEXER_CONFIRMATIONS ?? DEFAULT_CONFIRMATIONS);
  try {
    const store = getChallengeStore();
    const res = await runIndexerTick(store, makeMonadIndexerClient(), {
      now: () => Math.floor(Date.now() / 1000),
      confirmations,
    });
    return NextResponse.json({
      head: res.head.toString(),
      scannedTo: res.scannedTo.toString(),
      matched: res.matched,
      skipped: res.skipped,
    });
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}
