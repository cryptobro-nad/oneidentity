/**
 * Validate a candidate native-MON transfer against a challenge.
 *
 * Pure and exhaustive: every condition the product requires is checked here, so
 * an attestation is only ever produced for a transfer that truly satisfies the
 * challenge. Reuse (tx/challenge single-use) is enforced separately by the store
 * and, ultimately, on-chain.
 */

import type { Challenge } from "./types";

export type ObservedTransfer = {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  value: bigint;
  blockNumber: bigint;
  status: "success" | "reverted";
};

export type ValidationContext = {
  headBlock: bigint;
  confirmations: number;
  now: number; // unix seconds
};

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateTransfer(
  challenge: Challenge,
  tx: ObservedTransfer,
  ctx: ValidationContext,
): ValidationResult {
  if (challenge.status !== "pending") return { ok: false, reason: "challenge not pending" };
  if (ctx.now >= challenge.expiresAt) return { ok: false, reason: "challenge expired" };
  if (tx.status !== "success") return { ok: false, reason: "transaction failed" };
  if (!tx.to || tx.to.toLowerCase() !== challenge.primary.toLowerCase()) {
    return { ok: false, reason: "wrong recipient" };
  }
  if (tx.from.toLowerCase() !== challenge.secondary.toLowerCase()) {
    return { ok: false, reason: "wrong sender" };
  }
  if (tx.value.toString() !== challenge.amountWei) {
    return { ok: false, reason: "wrong amount" };
  }
  // Must be after the challenge was created...
  if (tx.blockNumber <= challenge.createdAtBlock) {
    return { ok: false, reason: "transfer predates challenge" };
  }
  // ...and deep enough to be final (reorg safety).
  if (tx.blockNumber > ctx.headBlock - BigInt(ctx.confirmations)) {
    return { ok: false, reason: "insufficient confirmations" };
  }
  return { ok: true };
}
