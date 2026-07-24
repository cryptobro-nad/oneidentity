/**
 * A Monad-backed IndexerClient over the app's RPC. Server-only.
 */

import { createClientFor } from "@/lib/rpc";
import { PRIMARY_RPC } from "@/lib/chain";
import type { IndexerClient } from "./indexer";

export function makeMonadIndexerClient(): IndexerClient {
  const vc = createClientFor(PRIMARY_RPC);
  return {
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
}
