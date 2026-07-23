import { describe, expect, it } from "vitest";
import {
  buildIncomingTransfersQuery,
  envioLogToRow,
  LOG_FIELD_SELECTION,
  walletTopic,
} from "./envioQuery";
import { TRANSFER_BATCH_TOPIC0, TRANSFER_SINGLE_TOPIC0, TRANSFER_TOPIC0 } from "./transferLogs";
import type { PortfolioAddress } from "@/lib/types";

const W = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;

describe("walletTopic", () => {
  it("pads an address into a lowercase 32-byte topic", () => {
    const t = walletTopic(W);
    expect(t).toHaveLength(66);
    expect(t).toBe(t.toLowerCase());
    expect(t.endsWith(W.toLowerCase().slice(2))).toBe(true);
  });
});

describe("buildIncomingTransfersQuery", () => {
  it("filters ERC-20/721 recipients in topic2 and ERC-1155 in topic3", () => {
    const q = buildIncomingTransfersQuery(W, 0, 1000);
    const to = walletTopic(W);
    expect(q.fromBlock).toBe(0);
    expect(q.maxNumLogs).toBe(1000);
    expect(q.fieldSelection.log).toEqual([...LOG_FIELD_SELECTION]);
    expect(q.logs?.[0]!.include.topics).toEqual([[TRANSFER_TOPIC0], [], [to]]);
    expect(q.logs?.[1]!.include.topics).toEqual([
      [TRANSFER_SINGLE_TOPIC0, TRANSFER_BATCH_TOPIC0],
      [],
      [],
      [to],
    ]);
  });
});

describe("envioLogToRow", () => {
  it("maps a HyperSync log to the neutral row shape", () => {
    expect(
      envioLogToRow({ address: "0xabc", topics: ["0x1", "0x2"], data: "0xdead", blockNumber: 5 }),
    ).toEqual({ address: "0xabc", topics: ["0x1", "0x2"], data: "0xdead", blockNumber: 5 });
  });
  it("defaults missing fields safely", () => {
    const row = envioLogToRow({ topics: [] });
    expect(row.address).toBe("");
    expect(row.data).toBe("0x");
    expect(row.topics).toEqual([]);
  });
});
