/**
 * Native-MON transfer indexer.
 *
 * Native transfers emit no logs, so we scan confirmed blocks and match
 * (recipient, exact value) against pending challenges, then validate every field
 * (see verifyTransfer). Only confirmed blocks (head - confirmations) are
 * processed, for reorg safety, and the cursor is persisted so a backend restart
 * resumes where it left off. No transaction hash is ever required from the user.
 */

import type { ChallengeStore } from "./store";
import { validateTransfer } from "./verifyTransfer";
import { APPROVAL_TTL_SECONDS, DEFAULT_CONFIRMATIONS } from "./types";

export type IndexedTx = {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  value: bigint;
};
export type IndexedBlock = { number: bigint; hash: string; transactions: IndexedTx[] };

export interface IndexerClient {
  getBlockNumber(): Promise<bigint>;
  getBlock(n: bigint): Promise<IndexedBlock>;
  getReceiptStatus(hash: `0x${string}`): Promise<"success" | "reverted">;
}

export type IndexerOptions = {
  now: () => number;
  confirmations?: number;
  batchSize?: number;
  leaseTtlSeconds?: number;
};

export type IndexerTickResult = { head: bigint; scannedTo: bigint; matched: number; skipped: boolean };

/**
 * One scan pass. Holds a DB-backed lease for its duration so concurrent cron and
 * polling requests can never process the same range twice or double-sign. Safe to
 * call from either; if the lease is held it returns `skipped` and does nothing.
 */
export async function runIndexerTick(
  store: ChallengeStore,
  client: IndexerClient,
  opts: IndexerOptions,
): Promise<IndexerTickResult> {
  const confirmations = opts.confirmations ?? DEFAULT_CONFIRMATIONS;
  const batchSize = BigInt(opts.batchSize ?? 200);
  const leaseTtl = opts.leaseTtlSeconds ?? 45;
  const now = opts.now();

  if (!(await store.tryAcquireScanLease(now, leaseTtl))) {
    return { head: 0n, scannedTo: 0n, matched: 0, skipped: true };
  }
  try {
    return await scan(store, client, { confirmations, batchSize, now });
  } finally {
    await store.releaseScanLease();
  }
}

async function scan(
  store: ChallengeStore,
  client: IndexerClient,
  { confirmations, batchSize, now }: { confirmations: number; batchSize: bigint; now: number },
): Promise<IndexerTickResult> {
  const head = await client.getBlockNumber();
  const safe = head - BigInt(confirmations);

  // Only pending challenges can be matched. If none are live, there is nothing to
  // detect: advance the cursor to the confirmed head so it never lags into an
  // un-catchable backlog during idle periods, and stop.
  const oldestPending = await store.oldestPendingCreatedBlock(now);
  const cursor = await store.getCursor();
  if (oldestPending === null) {
    if (safe > (cursor?.block ?? 0n)) await store.setCursor(safe, null);
    return { head, scannedTo: safe, matched: 0, skipped: false };
  }

  // Start no earlier than the oldest pending challenge. A transfer can only exist
  // at/after its challenge's block, so blocks below this hold nothing matchable —
  // skipping them keeps a stale cursor from making detection unreachably slow on
  // a fast chain (the bug that made a real transfer expire undetected).
  const cursorNext = cursor ? cursor.block + 1n : 0n;
  const from = cursorNext > oldestPending ? cursorNext : oldestPending;
  if (from > safe) return { head, scannedTo: cursor?.block ?? safe, matched: 0, skipped: false };

  const to = from + batchSize - 1n < safe ? from + batchSize - 1n : safe;
  let matched = 0;

  for (let n = from; n <= to; n++) {
    const block = await client.getBlock(n);
    for (const tx of block.transactions) {
      if (tx.to === null || tx.value === 0n) continue;
      const candidates = await store.findMatchable(tx.to, tx.value.toString());
      if (candidates.length === 0) continue;
      if (await store.txUsed(tx.hash)) continue;
      const status = await client.getReceiptStatus(tx.hash);
      for (const ch of candidates) {
        const res = validateTransfer(
          ch,
          { hash: tx.hash, from: tx.from, to: tx.to, value: tx.value, blockNumber: block.number, status },
          { headBlock: head, confirmations, now },
        );
        if (!res.ok) continue;
        await store.update({
          ...ch,
          status: "verified",
          txHash: tx.hash,
          txBlock: block.number,
          verifiedAt: now,
          approvalDeadline: now + APPROVAL_TTL_SECONDS,
        });
        matched++;
        break; // a transfer backs at most one challenge
      }
    }
    await store.setCursor(block.number, block.hash);
  }

  return { head, scannedTo: to, matched, skipped: false };
}

/** Marks a pending challenge expired once its 5-minute window has passed. */
export function expireIfStale<T extends { status: string; expiresAt: number }>(c: T, now: number): T {
  if (c.status === "pending" && now >= c.expiresAt) return { ...c, status: "expired" };
  return c;
}
