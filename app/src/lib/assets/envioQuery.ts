/**
 * HyperSync query construction and response mapping.
 *
 * The types below are a minimal structural subset of `@envio-dev/hypersync-client`'s
 * own `Query`/`QueryResponse`/`Log` (verified against its bundled `index.d.ts`),
 * so the real client satisfies `HyperSyncQueryClient` without importing the
 * native module here. That keeps this module — and its tests — free of the napi
 * binary; only the runtime factory (`envioClient.ts`) touches it.
 */

import type { PortfolioAddress } from "@/lib/types";
import type { NormalizedLogRow } from "./transferLogs";
import {
  TRANSFER_BATCH_TOPIC0,
  TRANSFER_SINGLE_TOPIC0,
  TRANSFER_TOPIC0,
} from "./transferLogs";

export type EnvioLogFilter = { address?: string[]; topics?: string[][] };
export type EnvioLogSelection = { include: EnvioLogFilter; exclude?: EnvioLogFilter };
export type EnvioQuery = {
  fromBlock: number;
  toBlock?: number;
  logs?: EnvioLogSelection[];
  fieldSelection: { log?: string[] };
  maxNumLogs?: number;
};
export type EnvioLog = {
  address?: string;
  data?: string;
  blockNumber?: number;
  topics: (string | null | undefined)[];
};
export type EnvioQueryResponse = {
  nextBlock: number;
  archiveHeight?: number;
  data: { logs: EnvioLog[] };
};

/** The only client capability the log source needs. */
export interface HyperSyncQueryClient {
  get(query: EnvioQuery): Promise<EnvioQueryResponse>;
}

/** Log fields to request — matches the client's PascalCase `LogField` enum. */
export const LOG_FIELD_SELECTION = [
  "Address",
  "Data",
  "Topic0",
  "Topic1",
  "Topic2",
  "Topic3",
  "BlockNumber",
] as const;

/** A 20-byte address as a lowercase 32-byte topic for topic matching. */
export function walletTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

/**
 * Builds a query for Transfer-family logs where `wallet` is the RECIPIENT.
 *
 * Two OR-ed log selections cover the different recipient topic positions:
 *   - ERC-20 / ERC-721 `Transfer`: recipient is topic2.
 *   - ERC-1155 `TransferSingle`/`TransferBatch`: recipient is topic3.
 * Receipt is sufficient for candidate discovery — a wallet cannot hold a token
 * it never received, and a reacquired token produces a fresh receipt.
 */
export function buildIncomingTransfersQuery(
  wallet: PortfolioAddress,
  fromBlock: number,
  maxNumLogs: number,
): EnvioQuery {
  const to = walletTopic(wallet);
  return {
    fromBlock,
    logs: [
      { include: { topics: [[TRANSFER_TOPIC0], [], [to]] } },
      { include: { topics: [[TRANSFER_SINGLE_TOPIC0, TRANSFER_BATCH_TOPIC0], [], [], [to]] } },
    ],
    fieldSelection: { log: [...LOG_FIELD_SELECTION] },
    maxNumLogs,
  };
}

/** Maps a HyperSync log to the provider-neutral row the decoder consumes. */
export function envioLogToRow(log: EnvioLog): NormalizedLogRow {
  return {
    address: log.address ?? "",
    topics: log.topics ?? [],
    data: log.data ?? "0x",
    blockNumber: log.blockNumber,
  };
}
