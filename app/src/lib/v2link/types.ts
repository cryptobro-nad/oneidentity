/**
 * Verified ONE V2 linking — backend types.
 *
 * A challenge lives in the database (cross-device), never in the browser. Its
 * lifecycle: pending → verified → linked, or → expired. Secondary control is
 * proven by an off-chain native-MON transfer the indexer detects; the primary
 * then submits `approveLink` with the verifier's signed attestation.
 */

import type { PortfolioAddress } from "@/lib/types";

export type ChallengeStatus = "pending" | "verified" | "linked" | "expired";

export type Challenge = {
  id: string;
  primary: PortfolioAddress;
  secondary: PortfolioAddress;
  /** Exact verification amount, wei, as a decimal string. */
  amountWei: string;
  createdAt: number; // unix seconds
  createdAtBlock: bigint;
  expiresAt: number; // createdAt + 5 min
  status: ChallengeStatus;
  /** Set once a matching transfer is detected. */
  txHash?: `0x${string}`;
  txBlock?: bigint;
  verifiedAt?: number;
  approvalDeadline?: number; // verifiedAt + 10 min
  linkedAt?: number;
  /** Unique per challenge; bound into the attestation. */
  verifierNonce: bigint;
};

/** The EIP-712 message the verifier signs; mirrors `ONERegistryV2.LinkAttestation`. */
export type LinkAttestation = {
  primary: PortfolioAddress;
  secondary: PortfolioAddress;
  one: PortfolioAddress;
  challengeId: `0x${string}`; // bytes32 derived from the DB id
  amount: bigint;
  txHash: `0x${string}`;
  txBlock: bigint;
  deadline: bigint;
  verifierNonce: bigint;
};

/** Windows and safety margins (seconds / blocks). */
export const CHALLENGE_TTL_SECONDS = 5 * 60;
export const APPROVAL_TTL_SECONDS = 10 * 60;
export const DEFAULT_CONFIRMATIONS = 8;
