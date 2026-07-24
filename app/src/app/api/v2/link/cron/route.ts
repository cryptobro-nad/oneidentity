import { NextResponse } from "next/server";
import { getChallengeStore } from "@/lib/v2link/storeFactory";
import { runIndexerTick, type IndexerClient } from "@/lib/v2link/indexer";
import { DEFAULT_CONFIRMATIONS } from "@/lib/v2link/types";
import { createClientFor } from "@/lib/rpc";
import { PRIMARY_RPC } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Indexer tick — scan confirmed blocks and mark matching challenges verified.
 * Scheduled via Vercel Cron (1/min). Authorised by CRON_SECRET. No user input.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const vc = createClientFor(PRIMARY_RPC);
  const client: IndexerClient = {
    getBlockNumber: () => vc.getBlockNumber(),
    getBlock: async (n) => {
      const b = await vc.getBlock({ blockNumber: n, includeTransactions: true });
      return {
        number: b.number ?? n,
        hash: b.hash ?? `0x${n.toString(16)}`,
        transactions: b.transactions.map((t) => ({
          hash: t.hash,
          from: t.from,
          to: t.to,
          value: t.value,
        })),
      };
    },
    getReceiptStatus: async (h) => {
      const r = await vc.getTransactionReceipt({ hash: h });
      return r.status === "success" ? "success" : "reverted";
    },
  };

  const confirmations = Number(process.env.INDEXER_CONFIRMATIONS ?? DEFAULT_CONFIRMATIONS);
  try {
    const store = getChallengeStore();
    const res = await runIndexerTick(store, client, {
      now: () => Math.floor(Date.now() / 1000),
      confirmations,
    });
    return NextResponse.json({
      head: res.head.toString(),
      scannedTo: res.scannedTo.toString(),
      matched: res.matched,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.split("\n")[0] : String(err) },
      { status: 500 },
    );
  }
}
