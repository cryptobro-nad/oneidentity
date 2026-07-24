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
};

export type IndexerTickResult = { head: bigint; scannedTo: bigint; matched: number };

export async function runIndexerTick(
  store: ChallengeStore,
  client: IndexerClient,
  opts: IndexerOptions,
): Promise<IndexerTickResult> {
  const confirmations = opts.confirmations ?? DEFAULT_CONFIRMATIONS;
  const batchSize = BigInt(opts.batchSize ?? 200);
  const now = opts.now();

  const head = await client.getBlockNumber();
  const safe = head - BigInt(confirmations);

  const cursor = await store.getCursor();
  // First run with no cursor: start at the confirmed head so we don't rescan all
  // history — challenges are always created at/after the current block.
  const from = cursor ? cursor.block + 1n : safe;
  if (from > safe) return { head, scannedTo: cursor?.block ?? safe, matched: 0 };

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

  return { head, scannedTo: to, matched };
}

/** Marks a pending challenge expired once its 5-minute window has passed. */
export function expireIfStale<T extends { status: string; expiresAt: number }>(c: T, now: number): T {
  if (c.status === "pending" && now >= c.expiresAt) return { ...c, status: "expired" };
  return c;
}
