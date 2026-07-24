import { NextResponse } from "next/server";
import { getChallengeStore } from "@/lib/v2link/storeFactory";
import { challengeIdBytes32 } from "@/lib/v2link/challenge";
import { expireIfStale, runIndexerTick } from "@/lib/v2link/indexer";
import { makeMonadIndexerClient } from "@/lib/v2link/indexerClient";
import { signAttestation } from "@/lib/v2link/attest";
import { resolveOneAddress, ONE_REGISTRY_V2_ADDRESS } from "@/lib/v2link/registry";
import { DEFAULT_CONFIRMATIONS, type LinkAttestation } from "@/lib/v2link/types";
import { rateLimit, clientKey } from "@/lib/v2link/rateLimit";
import { safeErrorMessage } from "@/lib/v2link/errors";

export const dynamic = "force-dynamic";

/**
 * GET → challenge status. When `verified`, returns the verifier-signed
 * LinkAttestation the primary submits to `approveLink`. The signing key
 * (VERIFIER_PRIVATE_KEY) never leaves the server.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Polling can be frequent; throttle per caller (defense in depth).
  if (!rateLimit(clientKey(req, "v2status"), { capacity: 30, refillPerSec: 1 })) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { id } = await ctx.params;
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
