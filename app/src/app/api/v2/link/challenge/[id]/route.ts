import { NextResponse } from "next/server";
import { getChallengeStore } from "@/lib/v2link/storeFactory";
import { challengeIdBytes32 } from "@/lib/v2link/challenge";
import { expireIfStale, runIndexerTick } from "@/lib/v2link/indexer";
import { makeMonadIndexerClient } from "@/lib/v2link/indexerClient";
import { signAttestation } from "@/lib/v2link/attest";
import { resolveOneAddress, ONE_REGISTRY_V2_ADDRESS } from "@/lib/v2link/registry";
import { DEFAULT_CONFIRMATIONS, type LinkAttestation } from "@/lib/v2link/types";
import { getRateLimiter, clientIp } from "@/lib/v2link/rateLimit";
import { tooManyRequests } from "@/lib/v2link/http";
import { safeErrorMessage } from "@/lib/v2link/errors";

export const dynamic = "force-dynamic";
// The GET may run a polling-triggered block scan inline; give it room to finish
// rather than being killed at the default limit.
export const maxDuration = 60;

/**
 * GET → challenge status. When `verified`, returns the verifier-signed
 * LinkAttestation the primary submits to `approveLink`. The signing key
 * (VERIFIER_PRIVATE_KEY) never leaves the server.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Polling can be frequent; throttle by IP and by challenge id (defense in
  // depth — the per-id bucket caps polling of any single challenge).
  const limiter = getRateLimiter();
  const [byIp, byId] = await Promise.all([
    limiter.check(`status:ip:${clientIp(req)}`, { capacity: 30, refillPerSec: 1 }),
    limiter.check(`status:challenge:${id}`, { capacity: 30, refillPerSec: 1 }),
  ]);
  if (!byIp.allowed) return tooManyRequests(byIp.retryAfterSeconds);
  if (!byId.allowed) return tooManyRequests(byId.retryAfterSeconds);

  const store = getChallengeStore();
  const now = Math.floor(Date.now() / 1000);

  let c = await store.get(id);
  if (!c) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const expired = expireIfStale(c, now);
  if (expired.status !== c.status) {
    await store.update(expired);
    c = expired;
  }

  // Polling-triggered scan: while still waiting, drive detection between cron
  // ticks. Lease-guarded and idempotent inside runIndexerTick, so a concurrent
  // cron run or another poll can never double-process or double-sign. Best
  // effort — if the RPC is unavailable the status still returns and cron retries.
  if (c.status === "pending") {
    try {
      const confirmations = Number(process.env.INDEXER_CONFIRMATIONS ?? DEFAULT_CONFIRMATIONS);
      await runIndexerTick(store, makeMonadIndexerClient(), { now: () => now, confirmations });
      const refreshed = await store.get(id);
      if (refreshed) c = refreshed;
    } catch {
      // RPC/indexer transient failure — return current status.
    }
  }

  if (c.status !== "verified") {
    return NextResponse.json({ status: c.status, amountWei: c.amountWei, expiresAt: c.expiresAt });
  }

  // Verified → build and sign the attestation for the on-chain approval.
  const key = process.env.VERIFIER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key || !ONE_REGISTRY_V2_ADDRESS) {
    return NextResponse.json({ error: "Verifier not configured." }, { status: 503 });
  }
  if (!c.txHash || c.txBlock === undefined || c.approvalDeadline === undefined) {
    return NextResponse.json({ error: "Incomplete verification record." }, { status: 500 });
  }

  let one: `0x${string}`;
  let signature: `0x${string}`;
  let att: LinkAttestation;
  try {
    one = await resolveOneAddress(c.primary);
    att = {
      primary: c.primary,
      secondary: c.secondary,
      one,
      challengeId: challengeIdBytes32(c.id),
      amount: BigInt(c.amountWei),
      txHash: c.txHash,
      txBlock: c.txBlock,
      deadline: BigInt(c.approvalDeadline),
      verifierNonce: c.verifierNonce,
    };
    signature = await signAttestation(att, key, ONE_REGISTRY_V2_ADDRESS);
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 502 });
  }

  return NextResponse.json({
    status: "verified",
    approvalDeadline: c.approvalDeadline,
    attestation: {
      primary: att.primary,
      secondary: att.secondary,
      one: att.one,
      challengeId: att.challengeId,
      amount: att.amount.toString(),
      txHash: att.txHash,
      txBlock: att.txBlock.toString(),
      deadline: att.deadline.toString(),
      verifierNonce: att.verifierNonce.toString(),
    },
    signature,
  });
}

/**
 * DELETE → cancel a pending/verified attempt so the pair is free for a fresh one
 * immediately (rather than waiting out the 5-minute window). Idempotent and safe:
 * cancelling a terminal or unknown challenge is a no-op. No attestation is issued.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const limiter = getRateLimiter();
  const byIp = await limiter.check(`cancel:ip:${clientIp(req)}`, { capacity: 20, refillPerSec: 1 });
  if (!byIp.allowed) return tooManyRequests(byIp.retryAfterSeconds);

  const store = getChallengeStore();
  await store.cancel(id);
  return NextResponse.json({ status: "cancelled" });
}

/**
 * POST → mark a verified challenge `linked` (terminal) once the primary's
 * approval is on chain. Only transitions verified→linked, so a later link of the
 * same pair starts fresh instead of resuming the old approval step. Idempotent.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const limiter = getRateLimiter();
  const byIp = await limiter.check(`linked:ip:${clientIp(req)}`, { capacity: 20, refillPerSec: 1 });
  if (!byIp.allowed) return tooManyRequests(byIp.retryAfterSeconds);

  const store = getChallengeStore();
  await store.markLinked(id);
  return NextResponse.json({ status: "linked" });
}
