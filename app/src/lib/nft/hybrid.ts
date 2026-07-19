/**
 * Hybrid NFT holdings: indexer discovers, chain decides.
 *
 * The indexer supplies candidate collection addresses and display names. Every
 * count shown to the user is then re-read on-chain with `balanceOf` via
 * Multicall3, per wallet, at a single pinned block.
 *
 * This ordering matters. An indexer can be stale, can miss a collection, or can
 * report a token that has since moved. Using it for *names and candidates* but
 * never for *numbers* means the worst an index error can cause is a missing row
 * or a row that reads zero — never a wrong balance attributed to a user.
 *
 * Failure handling mirrors ONEIdentity.combinedERC721Balance: a read that fails
 * is reported as a failure and excluded from the total, never counted as zero.
 */

import { getAddress, parseAbi, type Address, type PublicClient } from "viem";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import { errorText } from "@/lib/rpc";
import type { PortfolioAddress } from "@/lib/types";
import type {
  DiscoveredCollection,
  DiscoveryBlockReason,
  NftDiscoveryProvider,
} from "./discovery";

const ERC721_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

const ERC721_INTERFACE_ID = "0x80ac58cd" as const;

export type WalletCount = {
  wallet: PortfolioAddress;
  /** null when the read failed — distinct from a genuine zero. */
  count: bigint | null;
  error?: string;
};

export type VerifiedCollection = {
  chainId: typeof MONAD_CHAIN_ID;
  contractAddress: PortfolioAddress;
  /** On-chain name() where available, else the indexer's, else null. */
  name: string | null;
  nameSource: "onchain" | "indexer" | "none";
  /** Sum of successful reads only. */
  total: bigint;
  perWallet: WalletCount[];
  /** True if any wallet's read failed — total is then a lower bound. */
  partial: boolean;
  /** False if ERC-165 says this is not an ERC-721. */
  isErc721: boolean;
};

export type HybridResult = {
  collections: VerifiedCollection[];
  blockNumber: bigint;
  /** Wallets whose discovery failed — their collections may be missing entirely. */
  discoveryFailures: {
    wallet: PortfolioAddress;
    error: string;
    blocked: boolean;
    reason: DiscoveryBlockReason;
  }[];
  /** True when discovery failed for any wallet, so the list may be incomplete. */
  discoveryPartial: boolean;
  /** True when any on-chain read failed. */
  verificationPartial: boolean;
  providerName: string;
  candidatesConsidered: number;
};

/**
 * Discovers candidates for every wallet, then verifies all of them against all
 * wallets on-chain.
 *
 * Note the cross-product: a collection discovered for wallet A is also checked
 * against wallet B. Indexers routinely miss holdings, and the combined view is
 * the whole point of ONE — so a collection found for any member is verified for
 * every member.
 */
export async function loadHybridNftHoldings(
  client: PublicClient,
  wallets: readonly PortfolioAddress[],
  provider: NftDiscoveryProvider,
  options: { extraCollections?: readonly DiscoveredCollection[] } = {},
): Promise<HybridResult> {
  const normalisedWallets = wallets.map((w) => getAddress(w) as PortfolioAddress);

  // --- Discovery -----------------------------------------------------------
  const discoveryFailures: HybridResult["discoveryFailures"] = [];
  const candidates = new Map<string, DiscoveredCollection>();

  const addCandidate = (c: DiscoveredCollection) => {
    // Dedupe by chainId + contract address, lowercased.
    const key = `${c.chainId}:${c.contractAddress.toLowerCase()}`;
    const existing = candidates.get(key);
    if (!existing) {
      candidates.set(key, { ...c, contractAddress: getAddress(c.contractAddress) as PortfolioAddress });
      return;
    }
    // Keep the first non-null name we see.
    if (!existing.name && c.name) existing.name = c.name;
  };

  for (const c of options.extraCollections ?? []) addCandidate(c);

  const outcomes = await Promise.all(normalisedWallets.map((w) => provider.discover(w)));
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      discoveryFailures.push({
        wallet: outcome.wallet,
        error: outcome.error,
        blocked: outcome.blocked,
        reason: outcome.reason,
      });
      continue;
    }
    for (const c of outcome.collections) addCandidate(c);
  }

  const candidateList = [...candidates.values()];

  // --- Verification --------------------------------------------------------
  const blockNumber = await client.getBlockNumber();

  if (candidateList.length === 0) {
    return {
      collections: [],
      blockNumber,
      discoveryFailures,
      discoveryPartial: discoveryFailures.length > 0,
      verificationPartial: false,
      providerName: provider.name,
      candidatesConsidered: 0,
    };
  }

  // One multicall for every (collection, wallet) balanceOf, plus name() and
  // supportsInterface() per collection. Pinned to one block so the combined
  // total describes a single moment.
  const balanceCalls = candidateList.flatMap((c) =>
    normalisedWallets.map((w) => ({
      address: c.contractAddress as Address,
      abi: ERC721_ABI,
      functionName: "balanceOf" as const,
      args: [w] as const,
    })),
  );

  const metaCalls = candidateList.flatMap((c) => [
    {
      address: c.contractAddress as Address,
      abi: ERC721_ABI,
      functionName: "supportsInterface" as const,
      args: [ERC721_INTERFACE_ID] as const,
    },
    {
      address: c.contractAddress as Address,
      abi: ERC721_ABI,
      functionName: "name" as const,
      args: [] as const,
    },
  ]);

  type Entry = { status: "success"; result: unknown } | { status: "failure"; error: unknown };

  const [balanceResults, metaResults] = await Promise.all([
    client.multicall({ contracts: balanceCalls, allowFailure: true, blockNumber }) as Promise<
      readonly Entry[]
    >,
    client.multicall({ contracts: metaCalls, allowFailure: true, blockNumber }) as Promise<
      readonly Entry[]
    >,
  ]);

  let verificationPartial = false;
  const collections: VerifiedCollection[] = [];

  candidateList.forEach((candidate, ci) => {
    const perWallet: WalletCount[] = normalisedWallets.map((wallet, wi) => {
      const entry = balanceResults[ci * normalisedWallets.length + wi];
      if (entry && entry.status === "success") {
        return { wallet, count: entry.result as bigint };
      }
      verificationPartial = true;
      return {
        wallet,
        count: null,
        error: entry ? errorText(entry.error) : "no result returned",
      };
    });

    const supportsEntry = metaResults[ci * 2];
    const nameEntry = metaResults[ci * 2 + 1];

    const isErc721 =
      supportsEntry?.status === "success" ? Boolean(supportsEntry.result) : false;

    let name = candidate.name;
    let nameSource: VerifiedCollection["nameSource"] = candidate.name ? "indexer" : "none";
    if (nameEntry?.status === "success" && typeof nameEntry.result === "string" && nameEntry.result.length > 0) {
      // Prefer the contract's own name over the indexer's label.
      name = nameEntry.result;
      nameSource = "onchain";
    }

    let total = 0n;
    let partial = false;
    for (const w of perWallet) {
      if (w.count === null) partial = true;
      else total += w.count;
    }

    collections.push({
      chainId: MONAD_CHAIN_ID,
      contractAddress: candidate.contractAddress,
      name,
      nameSource,
      total,
      perWallet,
      partial,
      isErc721,
    });
  });

  return {
    collections: collections
      // Only surface collections actually held, but keep failed reads visible
      // so a failure is never silently indistinguishable from "holds none".
      .filter((c) => c.total > 0n || c.partial)
      .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0)),
    blockNumber,
    discoveryFailures,
    discoveryPartial: discoveryFailures.length > 0,
    verificationPartial,
    providerName: provider.name,
    candidatesConsidered: candidateList.length,
  };
}
