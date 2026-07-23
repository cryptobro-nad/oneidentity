import { describe, expect, it } from "vitest";
import { EnvioHyperSyncLogSource } from "./envioLogSource";
import { isLogSourceError } from "../provider";
import type { EnvioQueryResponse, HyperSyncQueryClient } from "../envioQuery";
import type { PortfolioAddress } from "@/lib/types";

const W = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;
const logRow = (address: string) => ({ address, topics: ["0x"], data: "0x", blockNumber: 1 });

/** A client that returns a fixed sequence of responses. */
function sequenced(responses: EnvioQueryResponse[]): HyperSyncQueryClient {
  let i = 0;
  return { get: async () => responses[Math.min(i++, responses.length - 1)]! };
}
function throwing(message: string): HyperSyncQueryClient {
  return {
    get: async () => {
      throw new Error(message);
    },
  };
}

describe("EnvioHyperSyncLogSource — pagination", () => {
  it("follows nextBlock to archive head and reports complete", async () => {
    const src = new EnvioHyperSyncLogSource(
      sequenced([
        { nextBlock: 100, archiveHeight: 200, data: { logs: [logRow("0xa")] } },
        { nextBlock: 200, archiveHeight: 200, data: { logs: [logRow("0xb")] } },
      ]),
    );
    const res = await src.collectIncomingTransfers(W);
    expect(isLogSourceError(res)).toBe(false);
    if (!isLogSourceError(res)) {
      expect(res.complete).toBe(true);
      expect(res.rows).toHaveLength(2);
      expect(res.archiveHeight).toBe(200n);
    }
  });

  it("stops and flags incomplete when the page cap is hit before head", async () => {
    const client: HyperSyncQueryClient = {
      get: async (q) => ({
        nextBlock: q.fromBlock + 1,
        archiveHeight: 1_000_000,
        data: { logs: [logRow("0xa")] },
      }),
    };
    const src = new EnvioHyperSyncLogSource(client, {
      maxPages: 3,
      maxTotalLogs: 1_000_000,
      maxNumLogsPerPage: 10,
    });
    const res = await src.collectIncomingTransfers(W);
    expect(isLogSourceError(res)).toBe(false);
    if (!isLogSourceError(res)) expect(res.complete).toBe(false);
  });

  it("stops and flags incomplete when the total-log cap is hit", async () => {
    const client: HyperSyncQueryClient = {
      get: async (q) => ({
        nextBlock: q.fromBlock + 1,
        archiveHeight: 1_000_000,
        data: { logs: [logRow("0xa"), logRow("0xb")] },
      }),
    };
    const src = new EnvioHyperSyncLogSource(client, {
      maxPages: 1_000,
      maxTotalLogs: 3,
      maxNumLogsPerPage: 10,
    });
    const res = await src.collectIncomingTransfers(W);
    if (!isLogSourceError(res)) expect(res.complete).toBe(false);
  });
});

describe("EnvioHyperSyncLogSource — error classification", () => {
  it("marks an auth error as blocked", async () => {
    const res = await new EnvioHyperSyncLogSource(
      throwing("401 Unauthorized: invalid token"),
    ).collectIncomingTransfers(W);
    expect(isLogSourceError(res)).toBe(true);
    if (isLogSourceError(res)) expect(res.blocked).toBe(true);
  });
  it("marks a rate/usage limit as blocked", async () => {
    const res = await new EnvioHyperSyncLogSource(
      throwing("429 rate limit exceeded"),
    ).collectIncomingTransfers(W);
    if (isLogSourceError(res)) expect(res.blocked).toBe(true);
  });
  it("marks a timeout as transient (not blocked)", async () => {
    const res = await new EnvioHyperSyncLogSource(
      throwing("request timed out after 30000ms"),
    ).collectIncomingTransfers(W);
    if (isLogSourceError(res)) expect(res.blocked).toBe(false);
  });
});
