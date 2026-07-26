import { describe, expect, it } from "vitest";
import { InMemoryChallengeStore } from "./store";
import { runIndexerTick, type IndexedBlock, type IndexerClient } from "./indexer";
import type { Challenge } from "./types";

const PRIMARY = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as `0x${string}`;
const SECONDARY = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as `0x${string}`;
const OTHER = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946" as `0x${string}`;
const AMOUNT = "15000000000000000";

class MockClient implements IndexerClient {
  head = 130n;
  blocks = new Map<bigint, IndexedBlock>();
  status = new Map<string, "success" | "reverted">();
  fetched: bigint[] = [];
  async getBlockNumber() {
    return this.head;
  }
  async getBlock(n: bigint) {
    this.fetched.push(n);
    return this.blocks.get(n) ?? { number: n, hash: `0x${n.toString(16)}`, transactions: [] };
  }
  async getReceiptStatus(hash: `0x${string}`) {
    return this.status.get(hash) ?? "success";
  }
  put(n: bigint, txs: IndexedBlock["transactions"]) {
    this.blocks.set(n, { number: n, hash: `0x${n.toString(16)}`, transactions: txs });
  }
}

function pending(id: string, over: Partial<Challenge> = {}): Challenge {
  return {
    id,
    primary: PRIMARY,
    secondary: SECONDARY,
    amountWei: AMOUNT,
    createdAt: 1000,
    createdAtBlock: 100n,
    expiresAt: 9_999_999_999,
    status: "pending",
    verifierNonce: BigInt(id.replace(/\D/g, "") || "0"),
    ...over,
  };
}

const now = () => 1100;

describe("runIndexerTick", () => {
  it("detects a valid transfer and marks the challenge verified", async () => {
    const store = new InMemoryChallengeStore();
    await store.setCursor(108n, "0x108");
    await store.create(pending("c1"));
    const client = new MockClient();
    client.put(110n, [{ hash: "0xtx1", from: SECONDARY, to: PRIMARY, value: BigInt(AMOUNT) }]);

    const res = await runIndexerTick(store, client, { now, confirmations: 8 });
    expect(res.matched).toBe(1);
    const c = await store.get("c1");
    expect(c?.status).toBe("verified");
    expect(c?.txHash).toBe("0xtx1");
    expect(c?.txBlock).toBe(110n);
    expect(c?.approvalDeadline).toBe(1100 + 600);
    // Cursor advanced to the confirmed head (130 - 8 = 122).
    expect((await store.getCursor())?.block).toBe(122n);
  });

  it("ignores a transfer from the wrong sender", async () => {
    const store = new InMemoryChallengeStore();
    await store.setCursor(108n, "0x108");
    await store.create(pending("c1"));
    const client = new MockClient();
    client.put(110n, [{ hash: "0xtx1", from: OTHER, to: PRIMARY, value: BigInt(AMOUNT) }]);
    const res = await runIndexerTick(store, client, { now, confirmations: 8 });
    expect(res.matched).toBe(0);
    expect((await store.get("c1"))?.status).toBe("pending");
  });

  it("does not scan unconfirmed blocks", async () => {
    const store = new InMemoryChallengeStore();
    await store.setCursor(108n, "0x108");
    await store.create(pending("c1"));
    const client = new MockClient();
    // Transfer at 125 is above the confirmed head (122) → not scanned.
    client.put(125n, [{ hash: "0xtx1", from: SECONDARY, to: PRIMARY, value: BigInt(AMOUNT) }]);
    const res = await runIndexerTick(store, client, { now, confirmations: 8 });
    expect(res.matched).toBe(0);
  });

  it("does not double-match an already-used transfer", async () => {
    const store = new InMemoryChallengeStore();
    await store.setCursor(108n, "0x108");
    await store.create(pending("c1"));
    const client = new MockClient();
    client.put(110n, [{ hash: "0xtx1", from: SECONDARY, to: PRIMARY, value: BigInt(AMOUNT) }]);
    await runIndexerTick(store, client, { now, confirmations: 8 }); // verifies c1

    // A second pending challenge (distinct pair + amount, so it is creatable)
    // must not be able to reuse tx1.
    await store.create(pending("c2", { secondary: OTHER, amountWei: "16000000000000000" }));
    client.head = 140n;
    client.put(110n, [{ hash: "0xtx1", from: SECONDARY, to: PRIMARY, value: BigInt(AMOUNT) }]);
    // Re-scan won't revisit block 110 (cursor is past it), and tx1 is used anyway.
    const res = await runIndexerTick(store, client, { now, confirmations: 8 });
    expect(res.matched).toBe(0);
  });

  it("detects the transfer even when the cursor lags far behind, without scanning old blocks", async () => {
    const store = new InMemoryChallengeStore();
    await store.setCursor(3n, "0x3"); // cursor stuck far behind after an idle gap
    await store.create(pending("c1", { createdAtBlock: 118n }));
    const client = new MockClient(); // head 130 → safe 122
    client.put(120n, [{ hash: "0xtx1", from: SECONDARY, to: PRIMARY, value: BigInt(AMOUNT) }]);

    const res = await runIndexerTick(store, client, { now, confirmations: 8 });
    expect(res.matched).toBe(1);
    expect((await store.get("c1"))?.status).toBe("verified");
    // Never fetched a block below the challenge's creation block (no lag work).
    expect(client.fetched.every((n) => n >= 118n)).toBe(true);
    expect(client.fetched).toContain(120n);
  });

  it("advances the cursor to the head and scans nothing when no challenge is pending", async () => {
    const store = new InMemoryChallengeStore();
    await store.setCursor(3n, "0x3");
    const client = new MockClient(); // head 130 → safe 122
    const res = await runIndexerTick(store, client, { now, confirmations: 8 });
    expect(res.matched).toBe(0);
    expect(client.fetched).toHaveLength(0); // no per-block work while idle
    expect((await store.getCursor())?.block).toBe(122n); // jumped to head, no backlog
  });

  it("skips (does nothing) when the scan lease is already held", async () => {
    const store = new InMemoryChallengeStore();
    await store.setCursor(108n, "0x108");
    await store.create(pending("c1"));
    // Someone else holds the lease for the whole tick window.
    expect(await store.tryAcquireScanLease(1100, 60)).toBe(true);
    const client = new MockClient();
    client.put(110n, [{ hash: "0xtx1", from: SECONDARY, to: PRIMARY, value: BigInt(AMOUNT) }]);

    const res = await runIndexerTick(store, client, { now, confirmations: 8 });
    expect(res.skipped).toBe(true);
    expect(res.matched).toBe(0);
    expect((await store.get("c1"))?.status).toBe("pending"); // untouched
  });

  it("resumes from the persisted cursor after a restart", async () => {
    const store = new InMemoryChallengeStore();
    await store.setCursor(108n, "0x108");
    const client = new MockClient();
    await runIndexerTick(store, client, { now, confirmations: 8 }); // cursor → 122
    expect((await store.getCursor())?.block).toBe(122n);

    // "Restart": a fresh tick (functions are stateless; state lives in the store).
    client.head = 140n; // safe → 132
    await store.create(pending("c3"));
    client.put(128n, [{ hash: "0xtx3", from: SECONDARY, to: PRIMARY, value: BigInt(AMOUNT) }]);
    const res = await runIndexerTick(store, client, { now, confirmations: 8 });
    expect(res.matched).toBe(1);
    expect((await store.get("c3"))?.status).toBe("verified");
    expect((await store.getCursor())?.block).toBe(132n);
  });
});
