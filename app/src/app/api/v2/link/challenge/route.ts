import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getChallengeStore } from "@/lib/v2link/storeFactory";
import { createChallenge } from "@/lib/v2link/challenge";
import { walletIsFree, primaryLinkState, ONE_REGISTRY_V2_ADDRESS } from "@/lib/v2link/registry";
import { getRateLimiter, clientIp } from "@/lib/v2link/rateLimit";
import { tooManyRequests } from "@/lib/v2link/http";
import { withRpcFallback } from "@/lib/rpc";
import type { PortfolioAddress } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST { primary, secondary } → a pending challenge (id, amount, expiry). */
export async function POST(req: Request) {
  if (!ONE_REGISTRY_V2_ADDRESS) {
    return NextResponse.json({ error: "V2 is not configured on this deployment." }, { status: 503 });
  }
  const limiter = getRateLimiter();

  // Throttle by IP before doing any work (creation touches the chain).
  const byIp = await limiter.check(`challenge:ip:${clientIp(req)}`, { capacity: 5, refillPerSec: 0.2 });
  if (!byIp.allowed) return tooManyRequests(byIp.retryAfterSeconds);

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
  if (!isAddress(primary) || !isAddress(secondary)) {
    return NextResponse.json({ error: "Enter a valid wallet address." }, { status: 400 });
  }
  if (getAddress(primary) === getAddress(secondary)) {
    return NextResponse.json(
      { error: "The secondary wallet must be different from the primary wallet." },
      { status: 400 },
    );
  }

  // Also throttle by primary address, so one identity cannot spam challenges
  // across many IPs.
  const byPrimary = await limiter.check(`challenge:primary:${getAddress(primary).toLowerCase()}`, {
    capacity: 5,
    refillPerSec: 0.2,
  });
  if (!byPrimary.allowed) return tooManyRequests(byPrimary.retryAfterSeconds);

  // The primary may already own a V2 identity (that's how more wallets are
  // added); the wallet being linked must be entirely free.
  try {
    const [pState, sFree] = await Promise.all([
      primaryLinkState(getAddress(primary) as PortfolioAddress),
      walletIsFree(getAddress(secondary) as PortfolioAddress),
    ]);
    if (!pState.ok) return NextResponse.json({ error: pState.error }, { status: 409 });
    if (!sFree) {
      return NextResponse.json({ error: "The wallet you're linking already belongs to a ONE." }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: "Could not check wallet state on Monad." }, { status: 502 });
  }

  const store = getChallengeStore();
  const result = await createChallenge(
    store,
    { primary, secondary },
    { now: () => Math.floor(Date.now() / 1000), currentBlock: () => currentBlock() },
  );
  if (!result.ok) {
    // A concurrent request already created the one allowed challenge for this pair.
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 400 });
  }

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
