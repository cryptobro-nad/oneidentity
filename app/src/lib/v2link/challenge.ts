/**
 * Challenge creation.
 *
 * The verification amount is NOT a security proof — the on-chain single-use
 * challengeId/txHash and the verifier attestation are. The amount only needs to
 * (a) be human-readable and (b) distinguish concurrent challenges for the same
 * pair. So: a random value in [0.01, 0.1) MON, made unique per active pair by the
 * store's unique index (retry on the rare clash).
 */

import { getAddress, isAddress, keccak256, toBytes } from "viem";
import type { ChallengeStore } from "./store";
import { CHALLENGE_TTL_SECONDS, type Challenge } from "./types";
import type { PortfolioAddress } from "@/lib/types";

const AMOUNT_MIN = 10n ** 16n; // 0.01 MON
const AMOUNT_SPAN = 9n * 10n ** 16n; // up to just under 0.1 MON

export type ChallengeDeps = {
  now: () => number; // unix seconds
  currentBlock: () => Promise<bigint>;
  randomWei?: () => bigint; // injectable for tests
  randomNonce?: () => bigint; // injectable for tests
  uuid?: () => string;
};

function randomBig(bytesLen: number): bigint {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

/** A random exact amount in [0.01, 0.1) MON, in wei. */
export function generateAmountWei(rand: () => bigint = defaultRandomWei): bigint {
  return AMOUNT_MIN + (rand() % AMOUNT_SPAN);
}

function defaultRandomWei(): bigint {
  return randomBig(8);
}

/** The bytes32 challenge id bound into the on-chain attestation. */
export function challengeIdBytes32(id: string): `0x${string}` {
  return keccak256(toBytes(id));
}

export type CreateChallengeInput = { primary: string; secondary: string };
export type CreateChallengeResult =
  | { ok: true; challenge: Challenge }
  | { ok: false; error: string };

export async function createChallenge(
  store: ChallengeStore,
  input: CreateChallengeInput,
  deps: ChallengeDeps,
): Promise<CreateChallengeResult> {
  if (!isAddress(input.primary, { strict: false }) || !isAddress(input.secondary, { strict: false })) {
    return { ok: false, error: "Enter valid wallet addresses." };
  }
  const primary = getAddress(input.primary) as PortfolioAddress;
  const secondary = getAddress(input.secondary) as PortfolioAddress;
  if (primary.toLowerCase() === secondary.toLowerCase()) {
    return { ok: false, error: "The secondary wallet must be different from the primary." };
  }

  const now = deps.now();

  // One active challenge per pair: if one is already live, return it (idempotent).
  // After it expires, a fresh call generates a completely new amount + challenge.
  const active = await store.findActiveForPair(secondary, primary, now);
  if (active) return { ok: true, challenge: active };

  const createdAtBlock = await deps.currentBlock();
  const rand = deps.randomWei ?? defaultRandomWei;
  const nonce = deps.randomNonce ?? (() => randomBig(12));
  const uuid = deps.uuid ?? (() => crypto.randomUUID());

  // Find an amount not currently active for this pair; retry on the rare clash.
  for (let attempt = 0; attempt < 8; attempt++) {
    const amountWei = generateAmountWei(rand).toString();
    if (await store.amountActiveForPair(secondary, primary, amountWei)) continue;

    const challenge: Challenge = {
      id: uuid(),
      primary,
      secondary,
      amountWei,
      createdAt: now,
      createdAtBlock,
      expiresAt: now + CHALLENGE_TTL_SECONDS,
      status: "pending",
      verifierNonce: nonce(),
    };
    try {
      await store.create(challenge);
      return { ok: true, challenge };
    } catch {
      // Unique-index race: another request took this amount/nonce. Try again.
    }
  }
  return { ok: false, error: "Could not allocate a unique amount, please retry." };
}
