/**
 * Synthetic HyperSync-shaped Transfer logs for provider tests.
 *
 * Rows use the REAL computed topic0 selectors from `transferLogs`, so the
 * fixtures exercise the same matching the production decoder uses. No hex event
 * hash is hand-written anywhere.
 */

import { encodeAbiParameters } from "viem";
import {
  TRANSFER_BATCH_TOPIC0,
  TRANSFER_SINGLE_TOPIC0,
  TRANSFER_TOPIC0,
  type NormalizedLogRow,
} from "../transferLogs";
import type {
  LogSourceError,
  LogSourceResult,
  TransferLogSource,
} from "../provider";
import type { PortfolioAddress } from "@/lib/types";

/** 20-byte address left-padded into a 32-byte topic. */
export function addressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

export function erc20TransferLog(
  contract: string,
  from: string,
  to: string,
  value: bigint,
): NormalizedLogRow {
  return {
    address: contract,
    topics: [TRANSFER_TOPIC0, addressTopic(from), addressTopic(to)],
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  };
}

export function erc721TransferLog(
  contract: string,
  from: string,
  to: string,
  tokenId: bigint,
): NormalizedLogRow {
  return {
    address: contract,
    topics: [
      TRANSFER_TOPIC0,
      addressTopic(from),
      addressTopic(to),
      `0x${tokenId.toString(16).padStart(64, "0")}`,
    ],
    data: "0x",
  };
}

export function erc1155SingleLog(
  contract: string,
  operator: string,
  from: string,
  to: string,
  id: bigint,
  value: bigint,
): NormalizedLogRow {
  return {
    address: contract,
    topics: [
      TRANSFER_SINGLE_TOPIC0,
      addressTopic(operator),
      addressTopic(from),
      addressTopic(to),
    ],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [id, value]),
  };
}

export function erc1155BatchLog(
  contract: string,
  operator: string,
  from: string,
  to: string,
  ids: bigint[],
  values: bigint[],
): NormalizedLogRow {
  return {
    address: contract,
    topics: [
      TRANSFER_BATCH_TOPIC0,
      addressTopic(operator),
      addressTopic(from),
      addressTopic(to),
    ],
    data: encodeAbiParameters([{ type: "uint256[]" }, { type: "uint256[]" }], [ids, values]),
  };
}

/** A log source backed by a per-wallet fixture map. */
export function fakeLogSource(
  byWallet: Record<string, LogSourceResult | LogSourceError>,
  options: { name?: string; configured?: boolean } = {},
): TransferLogSource {
  return {
    name: options.name ?? "fake",
    configured: options.configured ?? true,
    async collectIncomingTransfers(wallet: PortfolioAddress) {
      return (
        byWallet[wallet.toLowerCase()] ?? { rows: [], complete: true }
      );
    },
  };
}

export const ok = (rows: NormalizedLogRow[], extra: Partial<LogSourceResult> = {}): LogSourceResult => ({
  rows,
  complete: true,
  ...extra,
});
