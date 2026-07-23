/**
 * Decoding Transfer-family logs into normalized, standard-tagged rows.
 *
 * A discovery provider hands us raw logs; this module turns each into a typed
 * transfer without trusting anything but the log's own structure. The event
 * selectors are COMPUTED from their signatures with viem rather than pasted as
 * hex, so a typo can never silently match the wrong event.
 *
 * Distinguishing ERC-20 from ERC-721 on the shared `Transfer` topic0:
 *   ERC-20   Transfer(address indexed from, address indexed to, uint256 value)
 *            → value is NOT indexed → 3 topics, value in data.
 *   ERC-721  Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
 *            → tokenId IS indexed → 4 topics (topic3 = tokenId), empty data.
 * The token standards mandate this, so topic count is a reliable *candidate*
 * classifier. Final truth still comes from RPC (`balanceOf`/`ownerOf`).
 */

import { decodeAbiParameters, getAddress, toEventSelector } from "viem";
import type { PortfolioAddress } from "@/lib/types";

export const TRANSFER_TOPIC0 = toEventSelector("Transfer(address,address,uint256)");
export const TRANSFER_SINGLE_TOPIC0 = toEventSelector(
  "TransferSingle(address,address,address,uint256,uint256)",
);
export const TRANSFER_BATCH_TOPIC0 = toEventSelector(
  "TransferBatch(address,address,address,uint256[],uint256[])",
);

/** Every topic0 a discovery query should request. */
export const DISCOVERY_TOPIC0S = [
  TRANSFER_TOPIC0,
  TRANSFER_SINGLE_TOPIC0,
  TRANSFER_BATCH_TOPIC0,
] as const;

/**
 * The provider-neutral log shape. Matches HyperSync's documented log field
 * selection (Address, Topic0..Topic3, Data) but names nothing Envio-specific,
 * so the same decoder serves any log source.
 */
export type NormalizedLogRow = {
  address: string;
  topics: (string | null | undefined)[];
  data: string;
  blockNumber?: number | bigint;
};

export type DecodedTransfer =
  | { standard: "erc20"; contract: PortfolioAddress; from: PortfolioAddress; to: PortfolioAddress }
  | {
      standard: "erc721";
      contract: PortfolioAddress;
      from: PortfolioAddress;
      to: PortfolioAddress;
      tokenId: string;
    }
  | {
      standard: "erc1155";
      contract: PortfolioAddress;
      from: PortfolioAddress;
      to: PortfolioAddress;
      ids: string[];
      values: string[];
    };

/** A 32-byte topic's trailing 20 bytes as a checksummed address, or null. */
function topicToAddress(topic: string | null | undefined): PortfolioAddress | null {
  if (!topic || typeof topic !== "string") return null;
  const hex = topic.startsWith("0x") ? topic.slice(2) : topic;
  if (hex.length < 40) return null;
  try {
    return getAddress(`0x${hex.slice(-40)}`) as PortfolioAddress;
  } catch {
    return null;
  }
}

function topicToTokenId(topic: string | null | undefined): string | null {
  if (!topic || typeof topic !== "string") return null;
  try {
    return BigInt(topic).toString();
  } catch {
    return null;
  }
}

/**
 * Decodes one log into a typed transfer, or null when it is not a recognized
 * Transfer event or is malformed. Never throws — a bad row is skipped, not fatal.
 */
export function decodeTransferLog(row: NormalizedLogRow): DecodedTransfer | null {
  const topic0 = row.topics?.[0];
  if (!topic0) return null;

  let contract: PortfolioAddress;
  try {
    contract = getAddress(row.address) as PortfolioAddress;
  } catch {
    return null;
  }

  if (topic0 === TRANSFER_TOPIC0) {
    const from = topicToAddress(row.topics[1]);
    const to = topicToAddress(row.topics[2]);
    if (!from || !to) return null;

    // 4 topics (indexed tokenId) → ERC-721; otherwise ERC-20.
    const topic3 = row.topics[3];
    if (topic3) {
      const tokenId = topicToTokenId(topic3);
      if (tokenId === null) return null;
      return { standard: "erc721", contract, from, to, tokenId };
    }
    return { standard: "erc20", contract, from, to };
  }

  if (topic0 === TRANSFER_SINGLE_TOPIC0) {
    // TransferSingle(operator indexed, from indexed, to indexed, id, value)
    const from = topicToAddress(row.topics[2]);
    const to = topicToAddress(row.topics[3]);
    if (!from || !to) return null;
    try {
      const [id, value] = decodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        row.data as `0x${string}`,
      );
      return {
        standard: "erc1155",
        contract,
        from,
        to,
        ids: [(id as bigint).toString()],
        values: [(value as bigint).toString()],
      };
    } catch {
      // Still a real ERC-1155 touch; record the contract with no ids parsed.
      return { standard: "erc1155", contract, from, to, ids: [], values: [] };
    }
  }

  if (topic0 === TRANSFER_BATCH_TOPIC0) {
    const from = topicToAddress(row.topics[2]);
    const to = topicToAddress(row.topics[3]);
    if (!from || !to) return null;
    try {
      const [ids, values] = decodeAbiParameters(
        [{ type: "uint256[]" }, { type: "uint256[]" }],
        row.data as `0x${string}`,
      );
      return {
        standard: "erc1155",
        contract,
        from,
        to,
        ids: (ids as bigint[]).map((x) => x.toString()),
        values: (values as bigint[]).map((x) => x.toString()),
      };
    } catch {
      return { standard: "erc1155", contract, from, to, ids: [], values: [] };
    }
  }

  return null;
}
