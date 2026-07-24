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

export interface ChallengeStore {
  /** Insert a new pending challenge. Rejects on any uniqueness violation:
   *  amount active for the pair, verifier nonce, or challenge id. */
  create(c: Challenge): Promise<void>;
  get(id: string): Promise<Challenge | null>;
  /** The single active challenge for a pair (pending & unexpired, or verified &
   *  within the approval window), or null — used to keep one active per pair. */
  findActiveForPair(secondary: PortfolioAddress, primary: PortfolioAddress, now: number): Promise<Challenge | null>;
  /** Pending, unexpired challenges whose recipient + amount match a transfer. */
  findMatchable(to: PortfolioAddress, amountWei: string): Promise<Challenge[]>;
  amountActiveForPair(secondary: PortfolioAddress, primary: PortfolioAddress, amountWei: string): Promise<boolean>;
  txUsed(txHash: `0x${string}`): Promise<boolean>;
  update(c: Challenge): Promise<void>;

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
    return c.status === "pending" || c.status === "verified";
  }

  async create(c: Challenge): Promise<void> {
    if (await this.amountActiveForPair(c.secondary, c.primary, c.amountWei)) {
      throw new Error("amount already active for this pair");
    }
    if (this.byId.has(c.id)) throw new Error("duplicate challenge id");
    for (const e of this.byId.values()) {
      if (e.verifierNonce === c.verifierNonce) throw new Error("duplicate verifier nonce");
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

  async amountActiveForPair(
    secondary: PortfolioAddress,
    primary: PortfolioAddress,
    amountWei: string,
  ): Promise<boolean> {
    for (const c of this.byId.values()) {
      if (
        this.active(c) &&
        c.secondary.toLowerCase() === secondary.toLowerCase() &&
        c.primary.toLowerCase() === primary.toLowerCase() &&
        c.amountWei === amountWei
      ) {
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
