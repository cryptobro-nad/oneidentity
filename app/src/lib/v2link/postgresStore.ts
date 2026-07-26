/**
 * Postgres-backed ChallengeStore (Neon in production, PGlite in tests).
 *
 * Uniqueness, single-use consumption, and the scan lease are enforced by the
 * database (unique indexes + atomic conditional updates), so concurrent cron and
 * polling requests can never both win. Addresses are stored lowercased and read
 * back checksummed.
 */

import { getAddress } from "viem";
import { UniqueViolation, type ChallengeStore } from "./store";
import type { Sql } from "./sql";
import type { Challenge, ChallengeStatus } from "./types";
import type { PortfolioAddress } from "@/lib/types";

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = "23505";

/** Rethrows a driver unique-violation as our typed `UniqueViolation` (carrying
 *  the constraint/index name), leaving every other error untouched. */
function rethrowUnique(err: unknown): never {
  const e = err as { code?: string; constraint?: string };
  if (e && e.code === PG_UNIQUE_VIOLATION) throw new UniqueViolation(e.constraint ?? "unknown");
  throw err;
}

type Row = {
  id: string;
  primary_addr: string;
  secondary_addr: string;
  amount_wei: string;
  created_at: string | number;
  created_at_block: string | number;
  expires_at: string | number;
  status: string;
  tx_hash: string | null;
  tx_block: string | number | null;
  verified_at: string | number | null;
  approval_deadline: string | number | null;
  linked_at: string | number | null;
  verifier_nonce: string;
};

function toChallenge(r: Row): Challenge {
  return {
    id: r.id,
    primary: getAddress(r.primary_addr) as PortfolioAddress,
    secondary: getAddress(r.secondary_addr) as PortfolioAddress,
    amountWei: BigInt(r.amount_wei).toString(),
    createdAt: Number(r.created_at),
    createdAtBlock: BigInt(r.created_at_block),
    expiresAt: Number(r.expires_at),
    status: r.status as ChallengeStatus,
    txHash: r.tx_hash ? (r.tx_hash as `0x${string}`) : undefined,
    txBlock: r.tx_block !== null ? BigInt(r.tx_block) : undefined,
    verifiedAt: r.verified_at !== null ? Number(r.verified_at) : undefined,
    approvalDeadline: r.approval_deadline !== null ? Number(r.approval_deadline) : undefined,
    linkedAt: r.linked_at !== null ? Number(r.linked_at) : undefined,
    verifierNonce: BigInt(r.verifier_nonce),
  };
}

const lc = (a: string) => a.toLowerCase();

export class PostgresChallengeStore implements ChallengeStore {
  constructor(private readonly sql: Sql) {}

  async create(c: Challenge): Promise<void> {
    try {
      await this.sql.query(
        `insert into v2_challenges
          (id, primary_addr, secondary_addr, amount_wei, created_at, created_at_block,
           expires_at, status, verifier_nonce)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          c.id,
          lc(c.primary),
          lc(c.secondary),
          c.amountWei,
          c.createdAt,
          c.createdAtBlock.toString(),
          c.expiresAt,
          c.status,
          c.verifierNonce.toString(),
        ],
      );
    } catch (err) {
      rethrowUnique(err);
    }
  }

  async get(id: string): Promise<Challenge | null> {
    const { rows } = await this.sql.query<Row>(`select * from v2_challenges where id = $1`, [id]);
    return rows[0] ? toChallenge(rows[0]) : null;
  }

  async findActiveForPair(
    secondary: PortfolioAddress,
    primary: PortfolioAddress,
    now: number,
  ): Promise<Challenge | null> {
    const { rows } = await this.sql.query<Row>(
      `select * from v2_challenges
        where secondary_addr = $1 and primary_addr = $2
          and ( (status = 'pending'  and expires_at > $3)
             or (status = 'verified' and approval_deadline > $3) )
        order by created_at desc limit 1`,
      [lc(secondary), lc(primary), now],
    );
    return rows[0] ? toChallenge(rows[0]) : null;
  }

  async findMatchable(to: PortfolioAddress, amountWei: string): Promise<Challenge[]> {
    const { rows } = await this.sql.query<Row>(
      `select * from v2_challenges where status = 'pending' and primary_addr = $1 and amount_wei = $2`,
      [lc(to), amountWei],
    );
    return rows.map(toChallenge);
  }

  async oldestPendingCreatedBlock(now: number): Promise<bigint | null> {
    const { rows } = await this.sql.query<{ min: string | null }>(
      `select min(created_at_block) as min from v2_challenges
        where status = 'pending' and expires_at > $1`,
      [now],
    );
    return rows[0]?.min != null ? BigInt(rows[0].min) : null;
  }

  async amountActiveForRecipient(primary: PortfolioAddress, amountWei: string): Promise<boolean> {
    const { rowCount } = await this.sql.query(
      `select 1 from v2_challenges
        where primary_addr = $1 and amount_wei = $2
          and status in ('pending','verified') limit 1`,
      [lc(primary), amountWei],
    );
    return rowCount > 0;
  }

  async txUsed(txHash: `0x${string}`): Promise<boolean> {
    const { rowCount } = await this.sql.query(
      `select 1 from v2_challenges where tx_hash = $1 limit 1`,
      [lc(txHash)],
    );
    return rowCount > 0;
  }

  async update(c: Challenge): Promise<void> {
    try {
      await this.sql.query(
        `update v2_challenges set
           status = $2, tx_hash = $3, tx_block = $4, verified_at = $5,
           approval_deadline = $6, linked_at = $7
         where id = $1`,
        [
          c.id,
          c.status,
          c.txHash ? lc(c.txHash) : null,
          c.txBlock !== undefined ? c.txBlock.toString() : null,
          c.verifiedAt ?? null,
          c.approvalDeadline ?? null,
          c.linkedAt ?? null,
        ],
      );
    } catch (err) {
      rethrowUnique(err);
    }
  }

  async cancel(id: string): Promise<void> {
    await this.sql.query(
      `update v2_challenges set status = 'cancelled'
        where id = $1 and status in ('pending','verified')`,
      [id],
    );
  }

  async markLinked(id: string): Promise<void> {
    await this.sql.query(
      `update v2_challenges set status = 'linked', linked_at = $2
        where id = $1 and status = 'verified'`,
      [id, Math.floor(Date.now() / 1000)],
    );
  }

  async expireStaleForPair(
    secondary: PortfolioAddress,
    primary: PortfolioAddress,
    now: number,
  ): Promise<void> {
    await this.sql.query(
      `update v2_challenges set status = 'expired'
        where secondary_addr = $1 and primary_addr = $2
          and ( (status = 'pending'  and expires_at <= $3)
             or (status = 'verified' and approval_deadline <= $3) )`,
      [lc(secondary), lc(primary), now],
    );
  }

  async getCursor(): Promise<{ block: bigint; hash: string | null } | null> {
    const { rows } = await this.sql.query<{ last_scanned_block: string; last_scanned_hash: string | null }>(
      `select last_scanned_block, last_scanned_hash from v2_indexer_cursor where id = 1`,
    );
    return rows[0] ? { block: BigInt(rows[0].last_scanned_block), hash: rows[0].last_scanned_hash } : null;
  }

  async setCursor(block: bigint, hash: string | null): Promise<void> {
    await this.sql.query(
      `insert into v2_indexer_cursor (id, last_scanned_block, last_scanned_hash)
       values (1, $1, $2)
       on conflict (id) do update set last_scanned_block = $1, last_scanned_hash = $2`,
      [block.toString(), hash],
    );
  }

  async tryAcquireScanLease(now: number, ttlSeconds: number): Promise<boolean> {
    const { rowCount } = await this.sql.query(
      `update v2_scan_lease set locked_until = $1 where id = 1 and locked_until < $2 returning id`,
      [now + ttlSeconds, now],
    );
    return rowCount > 0;
  }

  async releaseScanLease(): Promise<void> {
    await this.sql.query(`update v2_scan_lease set locked_until = 0 where id = 1`);
  }
}
