/**
 * Challenge persistence boundary.
 *
 * The interface is what the challenge/indexer logic depends on, so it is unit
 * tested against the in-memory implementation here, and against a real Postgres
 * (via PGlite in tests, Neon in production — see postgresStore.ts). Uniqueness,
 * single-use, and lease guarantees below MUST be enforced by the backing store
 * (unique indexes + transactions in Postgres) so concurrent requests can never
 * both win.
 */

import type { Challenge } from "./types";
import type { PortfolioAddress } from "@/lib/types";

/** Statuses that count as an active (blocking) challenge for a pair. Terminal
 *  statuses — expired, cancelled, linked — never block a fresh attempt. */
export const ACTIVE_STATUSES = ["pending", "verified"] as const;

/** DB constraint names, shared by the migration and both store implementations
 *  so a violation can be classified identically everywhere. */
export const CONSTRAINT = {
  ACTIVE_PAIR: "v2_uniq_active_pair", // one active challenge per (secondary, primary)
  RECIPIENT_AMOUNT: "v2_uniq_active_recipient_amount", // amount unique per recipient while active
  VERIFIER_NONCE: "v2_uniq_verifier_nonce",
  CHALLENGE_ID: "v2_challenges_pkey",
  TX_HASH: "v2_uniq_tx_hash",
} as const;

export type ConstraintName = (typeof CONSTRAINT)[keyof typeof CONSTRAINT];

/** Thrown by `create`/`update` when a unique index rejects the write. Carries the
 *  constraint so the caller can decide whether to regenerate (amount/nonce/id)
 *  or surface a conflict (active pair). */
export class UniqueViolation extends Error {
  constructor(public readonly constraint: string) {
    super(`unique violation: ${constraint}`);
    this.name = "UniqueViolation";
  }
}

export interface ChallengeStore {
  /** Insert a new pending challenge. Throws `UniqueViolation` on any uniqueness
   *  violation: active pair, active recipient+amount, verifier nonce, or id. */
  create(c: Challenge): Promise<void>;
  get(id: string): Promise<Challenge | null>;
  /** The single active challenge for a pair (pending & unexpired, or verified &
   *  within the approval window), or null — used to keep one active per pair. */
  findActiveForPair(secondary: PortfolioAddress, primary: PortfolioAddress, now: number): Promise<Challenge | null>;
  /** Pending, unexpired challenges whose recipient + amount match a transfer. */
  findMatchable(to: PortfolioAddress, amountWei: string): Promise<Challenge[]>;
  /** The lowest `createdAtBlock` among live pending challenges, or null if none.
   *  The indexer never needs to scan below this — a transfer can only exist at or
   *  after the block its challenge was created — so clamping the scan start here
   *  stops a stale cursor from lagging into an un-catchable backlog. */
  oldestPendingCreatedBlock(now: number): Promise<bigint | null>;
  /** True if an active challenge already targets this recipient with this exact
   *  amount (keeps the amount → challenge match unambiguous). */
  amountActiveForRecipient(primary: PortfolioAddress, amountWei: string): Promise<boolean>;
  txUsed(txHash: `0x${string}`): Promise<boolean>;
  update(c: Challenge): Promise<void>;
  /** Marks a pending/verified challenge cancelled (terminal), freeing the pair
   *  for a fresh attempt immediately. No-op if it is not currently active. */
  cancel(id: string): Promise<void>;
  /** Marks a verified challenge `linked` (terminal) once its approval is on
   *  chain, so a later link of the same pair starts fresh instead of resuming
   *  the old "approve" step. No-op unless the challenge is currently verified. */
  markLinked(id: string): Promise<void>;
  /** Flips any time-expired pending/verified challenges for a pair to `expired`,
   *  freeing the active-pair unique index so a fresh attempt can be created.
   *  (The partial index is status-based; a lapsed challenge still reads
   *  `pending` until flipped.) */
  expireStaleForPair(secondary: PortfolioAddress, primary: PortfolioAddress, now: number): Promise<void>;

  getCursor(): Promise<{ block: bigint; hash: string | null } | null>;
  setCursor(block: bigint, hash: string | null): Promise<void>;

  /** Acquire the single scan lease if free; returns true if acquired. Prevents
   *  concurrent cron + polling scans from processing the same range. */
  tryAcquireScanLease(now: number, ttlSeconds: number): Promise<boolean>;
  releaseScanLease(): Promise<void>;
}

/** In-memory store for tests/dev. Enforces the same guarantees the DB must. */
export class InMemoryChallengeStore implements ChallengeStore {
  private byId = new Map<string, Challenge>();
  private cursor: { block: bigint; hash: string | null } | null = null;
  private leaseUntil = 0;

  private active(c: Challenge): boolean {
    return (ACTIVE_STATUSES as readonly string[]).includes(c.status);
  }

  async create(c: Challenge): Promise<void> {
    if (this.byId.has(c.id)) throw new UniqueViolation(CONSTRAINT.CHALLENGE_ID);
    for (const e of this.byId.values()) {
      if (e.verifierNonce === c.verifierNonce) throw new UniqueViolation(CONSTRAINT.VERIFIER_NONCE);
      if (!this.active(e)) continue;
      if (
        e.secondary.toLowerCase() === c.secondary.toLowerCase() &&
        e.primary.toLowerCase() === c.primary.toLowerCase()
      ) {
        throw new UniqueViolation(CONSTRAINT.ACTIVE_PAIR);
      }
      if (e.primary.toLowerCase() === c.primary.toLowerCase() && e.amountWei === c.amountWei) {
        throw new UniqueViolation(CONSTRAINT.RECIPIENT_AMOUNT);
      }
    }
    this.byId.set(c.id, { ...c });
  }

  async get(id: string): Promise<Challenge | null> {
    const c = this.byId.get(id);
    return c ? { ...c } : null;
  }

  async findActiveForPair(
    secondary: PortfolioAddress,
    primary: PortfolioAddress,
    now: number,
  ): Promise<Challenge | null> {
    for (const c of this.byId.values()) {
      if (c.secondary.toLowerCase() !== secondary.toLowerCase()) continue;
      if (c.primary.toLowerCase() !== primary.toLowerCase()) continue;
      if (c.status === "pending" && now < c.expiresAt) return { ...c };
      if (c.status === "verified" && (c.approvalDeadline ?? 0) > now) return { ...c };
    }
    return null;
  }

  async findMatchable(to: PortfolioAddress, amountWei: string): Promise<Challenge[]> {
    const out: Challenge[] = [];
    for (const c of this.byId.values()) {
      if (
        c.status === "pending" &&
        c.primary.toLowerCase() === to.toLowerCase() &&
        c.amountWei === amountWei
      ) {
        out.push({ ...c });
      }
    }
    return out;
  }

  async oldestPendingCreatedBlock(now: number): Promise<bigint | null> {
    let min: bigint | null = null;
    for (const c of this.byId.values()) {
      if (c.status === "pending" && now < c.expiresAt) {
        if (min === null || c.createdAtBlock < min) min = c.createdAtBlock;
      }
    }
    return min;
  }

  async amountActiveForRecipient(primary: PortfolioAddress, amountWei: string): Promise<boolean> {
    for (const c of this.byId.values()) {
      if (this.active(c) && c.primary.toLowerCase() === primary.toLowerCase() && c.amountWei === amountWei) {
        return true;
      }
    }
    return false;
  }

  async txUsed(txHash: `0x${string}`): Promise<boolean> {
    for (const c of this.byId.values()) {
      if (c.txHash && c.txHash.toLowerCase() === txHash.toLowerCase()) return true;
    }
    return false;
  }

  async update(c: Challenge): Promise<void> {
    this.byId.set(c.id, { ...c });
  }

  async cancel(id: string): Promise<void> {
    const c = this.byId.get(id);
    if (c && this.active(c)) this.byId.set(id, { ...c, status: "cancelled" });
  }

  async markLinked(id: string): Promise<void> {
    const c = this.byId.get(id);
    if (c && c.status === "verified") {
      this.byId.set(id, { ...c, status: "linked", linkedAt: Math.floor(Date.now() / 1000) });
    }
  }

  async expireStaleForPair(
    secondary: PortfolioAddress,
    primary: PortfolioAddress,
    now: number,
  ): Promise<void> {
    for (const c of this.byId.values()) {
      if (c.secondary.toLowerCase() !== secondary.toLowerCase()) continue;
      if (c.primary.toLowerCase() !== primary.toLowerCase()) continue;
      const stale =
        (c.status === "pending" && now >= c.expiresAt) ||
        (c.status === "verified" && now >= (c.approvalDeadline ?? 0));
      if (stale) this.byId.set(c.id, { ...c, status: "expired" });
    }
  }

  async getCursor() {
    return this.cursor ? { ...this.cursor } : null;
  }

  async setCursor(block: bigint, hash: string | null): Promise<void> {
    this.cursor = { block, hash };
  }

  async tryAcquireScanLease(now: number, ttlSeconds: number): Promise<boolean> {
    if (this.leaseUntil > now) return false;
    this.leaseUntil = now + ttlSeconds;
    return true;
  }

  async releaseScanLease(): Promise<void> {
    this.leaseUntil = 0;
  }
}
