/**
 * Challenge persistence boundary.
 *
 * The interface is what the challenge/indexer logic depends on, so it is unit
 * tested against the in-memory implementation here, and backed by Postgres in
 * production (see docs/verified-one-v2.md §3.4 for the schema; the adapter maps
 * 1:1 onto these methods). Uniqueness/reuse guarantees below MUST be enforced by
 * the backing store (unique indexes in Postgres) so two concurrent requests can
 * never both win.
 */

import type { Challenge } from "./types";
import type { PortfolioAddress } from "@/lib/types";

export interface ChallengeStore {
  /** Insert a new pending challenge. Rejects if the amount is already active for
   *  the pair (unique per (secondary, primary, amount) over pending|verified). */
  create(c: Challenge): Promise<void>;
  get(id: string): Promise<Challenge | null>;
  /** Pending, unexpired challenges whose recipient + amount match a transfer. */
  findMatchable(to: PortfolioAddress, amountWei: string): Promise<Challenge[]>;
  /** True if `amountWei` is already active for the pair (pending|verified). */
  amountActiveForPair(secondary: PortfolioAddress, primary: PortfolioAddress, amountWei: string): Promise<boolean>;
  /** True if a challenge already recorded this transfer (single-use). */
  txUsed(txHash: `0x${string}`): Promise<boolean>;
  update(c: Challenge): Promise<void>;

  getCursor(): Promise<{ block: bigint; hash: string | null } | null>;
  setCursor(block: bigint, hash: string | null): Promise<void>;
}

/** In-memory store for tests/dev. Enforces the same uniqueness the DB must. */
export class InMemoryChallengeStore implements ChallengeStore {
  private byId = new Map<string, Challenge>();
  private cursor: { block: bigint; hash: string | null } | null = null;

  private isActive(c: Challenge): boolean {
    return c.status === "pending" || c.status === "verified";
  }

  async create(c: Challenge): Promise<void> {
    if (await this.amountActiveForPair(c.secondary, c.primary, c.amountWei)) {
      throw new Error("amount already active for this pair");
    }
    this.byId.set(c.id, { ...c });
  }

  async get(id: string): Promise<Challenge | null> {
    const c = this.byId.get(id);
    return c ? { ...c } : null;
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
        this.isActive(c) &&
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
}
