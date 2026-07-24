import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getChallengeStore } from "@/lib/v2link/storeFactory";
import { createChallenge } from "@/lib/v2link/challenge";
import { walletIsFree, ONE_REGISTRY_V2_ADDRESS } from "@/lib/v2link/registry";
import { withRpcFallback } from "@/lib/rpc";
import type { PortfolioAddress } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST { primary, secondary } → a pending challenge (id, amount, expiry). */
export async function POST(req: Request) {
  if (!ONE_REGISTRY_V2_ADDRESS) {
    return NextResponse.json({ error: "V2 is not configured on this deployment." }, { status: 503 });
  }
  let body: { primary?: string; secondary?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { primary, secondary } = body;
  if (!primary || !secondary) {
    return NextResponse.json({ error: "primary and secondary are required." }, { status: 400 });
  }

  // Reject wallets already active in V1 or V2 before issuing a challenge.
  try {
    const [pFree, sFree] = await Promise.all([
      walletIsFree(getAddress(primary) as PortfolioAddress),
      walletIsFree(getAddress(secondary) as PortfolioAddress),
    ]);
    if (!pFree) return NextResponse.json({ error: "The primary wallet already belongs to a ONE." }, { status: 409 });
    if (!sFree) return NextResponse.json({ error: "The secondary wallet already belongs to a ONE." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Could not check wallet state on Monad." }, { status: 502 });
  }

  const store = getChallengeStore();
  const result = await createChallenge(
    store,
    { primary, secondary },
    { now: () => Math.floor(Date.now() / 1000), currentBlock: () => currentBlock() },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const c = result.challenge;
  return NextResponse.json({
    id: c.id,
    primary: c.primary,
    secondary: c.secondary,
    amountWei: c.amountWei,
    expiresAt: c.expiresAt,
  });
}

async function currentBlock(): Promise<bigint> {
  const outcome = await withRpcFallback((client) => client.getBlockNumber());
  return outcome.value;
}
