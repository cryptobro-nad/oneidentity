/**
 * User-entered ERC-721 collection balance checks.
 *
 * Scope is deliberately narrow, per the mainnet data spike's Option B finding:
 * no affordable, reliable indexer can enumerate a wallet's NFTs on Monad today,
 * so ONE asks the user which collection to check and answers that precisely.
 *
 * This is the same question `ONEIdentity.combinedERC721Balance()` answers
 * on-chain, and it is answered the same way: `balanceOf` per member, summed,
 * with failures surfaced rather than absorbed.
 *
 * No collection names, images, or token IDs are fetched. No ERC-1155 support
 * is claimed — `balanceOf(address)` on an ERC-1155 has a different signature
 * and will simply fail the check below.
 */

import { getAddress, parseAbi, type PublicClient } from "viem";
import { errorText, withRpcFallback, type WithRpcOptions } from "./rpc";
import type { NftCollectionCheck, NftWalletCount, PortfolioAddress } from "./types";

/** Only the functions we actually call. */
const ERC721_BALANCE_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

const ERC165_ABI = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

/** ERC-721 interface id. */
const ERC721_INTERFACE_ID = "0x80ac58cd" as const;

export type CheckCollectionOptions = WithRpcOptions & {
  now?: () => number;
};

/**
 * Result kinds:
 *  - `not-a-contract` — no bytecode at the address
 *  - `not-erc721`     — has code, but every `balanceOf(address)` call failed
 *  - `ok`             — at least one wallet answered; failures listed per wallet
 */
export async function checkCollectionWithClient(
  client: PublicClient,
  collection: PortfolioAddress,
  addresses: readonly PortfolioAddress[],
): Promise<Omit<Extract<NftCollectionCheck, { status: "ok" }>, "endpointUsed" | "checkedAt"> | { status: "not-a-contract" | "not-erc721"; address: PortfolioAddress }> {
  const collectionAddress = getAddress(collection);
  const wallets = addresses.map((a) => getAddress(a));

  // A plain EOA or an empty address is not a collection. Checking this first
  // gives a precise message instead of a confusing pile of failed calls.
  const code = await client.getCode({ address: collectionAddress });
  if (!code || code === "0x") {
    return { status: "not-a-contract", address: collectionAddress };
  }

  // ERC-20 exposes the same `balanceOf(address)` signature as ERC-721, so the
  // balance calls alone cannot tell them apart — pasting a token address would
  // otherwise render its raw ERC-20 balance as an NFT count. ERC-721 mandates
  // ERC-165, so a positive interface check is required before we count anything.
  const isErc721 = await client
    .readContract({
      address: collectionAddress,
      abi: ERC165_ABI,
      functionName: "supportsInterface",
      args: [ERC721_INTERFACE_ID],
    })
    .catch(() => false);

  if (!isErc721) {
    return { status: "not-erc721", address: collectionAddress };
  }

  const blockNumber = await client.getBlockNumber();

  const results = await client.multicall({
    contracts: wallets.map((address) => ({
      address: collectionAddress,
      abi: ERC721_BALANCE_ABI,
      functionName: "balanceOf" as const,
      args: [address] as const,
    })),
    allowFailure: true,
    blockNumber,
  });

  const walletCounts: NftWalletCount[] = wallets.map((address, i) => {
    const entry = results[i];
    if (entry && entry.status === "success") {
      return { address, result: { success: true, rawValue: entry.result as bigint } };
    }
    return {
      address,
      result: {
        success: false,
        error: entry ? errorText(entry.error) : "no result returned for this call",
      },
    };
  });

  // Every call failing on a contract that exists means it does not expose
  // ERC-721 `balanceOf(address)`. Say so plainly rather than showing "0".
  const anySucceeded = walletCounts.some((w) => w.result.success);
  if (!anySucceeded) {
    return { status: "not-erc721", address: collectionAddress };
  }

  let total = 0n;
  let partial = false;
  for (const wallet of walletCounts) {
    if (wallet.result.success && wallet.result.rawValue !== undefined) {
      total += wallet.result.rawValue;
    } else {
      partial = true;
    }
  }

  return {
    status: "ok",
    address: collectionAddress,
    wallets: walletCounts,
    total,
    partial,
    blockNumber,
  };
}

export async function checkCollection(
  collection: PortfolioAddress,
  addresses: readonly PortfolioAddress[],
  options: CheckCollectionOptions = {},
): Promise<NftCollectionCheck> {
  const now = options.now ?? Date.now;
  const outcome = await withRpcFallback(
    (client) => checkCollectionWithClient(client, collection, addresses),
    options,
  );

  if (outcome.value.status !== "ok") return outcome.value;

  return {
    ...outcome.value,
    endpointUsed: outcome.endpointUsed,
    checkedAt: now(),
  };
}
