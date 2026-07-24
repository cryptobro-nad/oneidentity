import { NextResponse } from "next/server";
import { getChallengeStore } from "@/lib/v2link/storeFactory";
import { challengeIdBytes32 } from "@/lib/v2link/challenge";
import { expireIfStale } from "@/lib/v2link/indexer";
import { signAttestation } from "@/lib/v2link/attest";
import { resolveOneAddress, ONE_REGISTRY_V2_ADDRESS } from "@/lib/v2link/registry";
import type { LinkAttestation } from "@/lib/v2link/types";

export const dynamic = "force-dynamic";

/**
 * GET → challenge status. When `verified`, returns the verifier-signed
 * LinkAttestation the primary submits to `approveLink`. The signing key
 * (VERIFIER_PRIVATE_KEY) never leaves the server.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  const one = await resolveOneAddress(c.primary);
  const att: LinkAttestation = {
    primary: c.primary,
    secondary: c.secondary,
    one,
    challengeId: challengeIdBytes32(c.id),
    amount: BigInt(c.amountWei),
    txHash: c.txHash,
    txBlock: c.txBlock,
    deadline: BigInt(c.approvalDeadline),
    verifierNonce: c.createdAtBlock,
  };
  const signature = await signAttestation(att, key, ONE_REGISTRY_V2_ADDRESS);

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
