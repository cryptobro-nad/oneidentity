/**
 * Challenge creation.
 *
 * The verification amount is NOT a security proof — the on-chain single-use
 * challengeId/txHash and the verifier attestation are. The amount only needs to
 * (a) be displayed and typed EXACTLY (so the transfer matches to the wei) and
 * (b) distinguish concurrent challenges. So it is a random multiple of a
 * 6-decimal step in [0.01, 0.1) MON — representable exactly in the 6-decimal UI
 * and by any wallet — made unique per recipient by the store's unique index
 * (regenerate on the rare clash). See docs/verified-one-v2.md §Amount audit.
 */

import { getAddress, isAddress, keccak256, toBytes } from "viem";
import { UniqueViolation, CONSTRAINT, type ChallengeStore } from "./store";
import { CHALLENGE_TTL_SECONDS, type Challenge } from "./types";
import type { PortfolioAddress } from "@/lib/types";

/**
 * Amount space. All exact integers in wei — no floating point anywhere.
 *   step  = 1e12 wei = 0.000001 MON  → exactly 6 decimal places
 *   range = [0.01 MON, 0.1 MON)      → 90,000 distinct steps
 * A 6-decimal display (`AMOUNT_DECIMALS`) reproduces the value with zero
 * rounding, and the string round-trips back to the exact wei.
 */
export const AMOUNT_STEP_WEI = 10n ** 12n; // 0.000001 MON
export const AMOUNT_MIN_WEI = 10n ** 16n; // 0.01 MON
export const AMOUNT_MAX_WEI = 10n ** 17n; // 0.1 MON (exclusive)
export const AMOUNT_STEPS = (AMOUNT_MAX_WEI - AMOUNT_MIN_WEI) / AMOUNT_STEP_WEI; // 90_000n
export const AMOUNT_DECIMALS = 6; // fraction digits the UI must display

export type ChallengeDeps = {
  now: () => number; // unix seconds
  currentBlock: () => Promise<bigint>;
  randomWei?: () => bigint; // injectable for tests (returns a step-aligned amount)
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

/**
 * A random exact amount in [0.01, 0.1) MON aligned to the 6-decimal step.
 * `randStep` returns an unbounded non-negative bigint; only its residue mod
 * AMOUNT_STEPS is used, so the result is always a valid, exactly-displayable
 * multiple of AMOUNT_STEP_WEI.
 */
export function generateAmountWei(randStep: () => bigint = defaultRandomStep): bigint {
  const stepIndex = ((randStep() % AMOUNT_STEPS) + AMOUNT_STEPS) % AMOUNT_STEPS;
  return AMOUNT_MIN_WEI + stepIndex * AMOUNT_STEP_WEI;
}

function defaultRandomStep(): bigint {
  return randomBig(8);
}

/** The bytes32 challenge id bound into the on-chain attestation. */
export function challengeIdBytes32(id: string): `0x${string}` {
  return keccak256(toBytes(id));
}

export type CreateChallengeInput = { primary: string; secondary: string };
export type CreateChallengeResult =
  | { ok: true; challenge: Challenge }
  | { ok: false; error: string; conflict?: boolean };

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
  // After it expires/cancels/links, a fresh call generates a new amount + id.
  const active = await store.findActiveForPair(secondary, primary, now);
  if (active) return { ok: true, challenge: active };

  // No time-active challenge, but a lapsed one may still read `pending` and hold
  // the active-pair index. Flip stale rows to `expired` so the insert can proceed.
  await store.expireStaleForPair(secondary, primary, now);

  const createdAtBlock = await deps.currentBlock();
  const rand = deps.randomWei ?? defaultRandomStep;
  const nonce = deps.randomNonce ?? (() => randomBig(12));
  const uuid = deps.uuid ?? (() => crypto.randomUUID());

  // Insert, letting the DB's unique indexes arbitrate races. A recipient+amount
  // or nonce/id clash is retried with fresh values; an active-pair clash means a
  // concurrent request already created the one allowed challenge → clear 409.
  for (let attempt = 0; attempt < 8; attempt++) {
    const amountWei = generateAmountWei(rand).toString();
    if (await store.amountActiveForRecipient(primary, amountWei)) continue; // fast pre-check

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
    } catch (err) {
      if (err instanceof UniqueViolation) {
        if (err.constraint === CONSTRAINT.ACTIVE_PAIR) {
          return {
            ok: false,
            conflict: true,
            error: "A link attempt for this wallet pair is already in progress.",
          };
        }
        // Amount / nonce / id collision → new values on the next attempt.
        continue;
      }
      throw err;
    }
  }
  return { ok: false, error: "Could not allocate a unique amount, please retry." };
}
