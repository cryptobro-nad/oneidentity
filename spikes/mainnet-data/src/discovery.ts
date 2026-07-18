/**
 * Finds real, currently-holding Mainnet addresses by reading the chain itself.
 *
 * Deliberately self-sourced: candidates come from live Transfer logs and are
 * then confirmed by a direct `balanceOf` / `ownerOf` call. Nothing here takes
 * an address from a blog post, a leaderboard, or a previous agent's notes, and
 * nothing is invented — if the chain yields no holder, the spike reports that.
 */

import {
  erc20Abi,
  getAddress,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";

/** keccak256("Transfer(address,address,uint256)") — shared by ERC-20 and ERC-721. */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

const ERC165_ABI = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

const ERC721_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

const ZERO = "0x0000000000000000000000000000000000000000";

const topicToAddress = (topic: `0x${string}`): Address =>
  getAddress(`0x${topic.slice(-40)}`);

/**
 * Scans back from head in windows until it finds `want` addresses that hold a
 * non-zero balance of `token` right now.
 */
export async function findTokenHolders(
  client: PublicClient,
  token: Address,
  want: number,
  opts: { window?: bigint; maxWindows?: number } = {},
): Promise<{ holders: Address[]; blocksScanned: number; logsSeen: number; error: string | null }> {
  // 100 blocks is the measured eth_getLogs ceiling on rpc.monad.xyz; 200 fails.
  const window = opts.window ?? 100n;
  const maxWindows = opts.maxWindows ?? 8;
  const head = await client.getBlockNumber();

  const seen = new Set<string>();
  const holders: Address[] = [];
  let blocksScanned = 0;
  let logsSeen = 0;

  for (let i = 0; i < maxWindows && holders.length < want; i++) {
    const toBlock = head - window * BigInt(i);
    const fromBlock = toBlock - window + 1n;
    if (fromBlock < 0n) break;

    let logs;
    try {
      logs = await client.getLogs({
        address: token,
        fromBlock,
        toBlock,
        event: {
          type: "event",
          name: "Transfer",
          inputs: [
            { name: "from", type: "address", indexed: true },
            { name: "to", type: "address", indexed: true },
            { name: "value", type: "uint256", indexed: false },
          ],
        },
      });
    } catch (err) {
      return {
        holders,
        blocksScanned,
        logsSeen,
        error: err instanceof Error ? (err.message.split("\n")[0] ?? err.message) : String(err),
      };
    }

    blocksScanned += Number(window);
    logsSeen += logs.length;

    // Recipients are the best holder candidates; newest first.
    const candidates: Address[] = [];
    for (const log of [...logs].reverse()) {
      const to = log.args.to;
      if (!to || to === ZERO) continue;
      const key = to.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(getAddress(to));
      if (candidates.length >= 40) break;
    }

    // Confirm each candidate still holds a balance.
    for (const candidate of candidates) {
      if (holders.length >= want) break;
      try {
        const bal = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [candidate],
        });
        if (bal > 0n) holders.push(candidate);
      } catch {
        // A candidate we cannot read is simply not selected.
      }
    }
  }

  return { holders, blocksScanned, logsSeen, error: null };
}

export type DiscoveredNft = {
  owner: Address;
  collection: Address;
  tokenId: string;
  collectionName: string | null;
  collectionSymbol: string | null;
  tokenUri: string | null;
  /** Confirmed by a direct ownerOf() call at the current head. */
  ownerConfirmedOnChain: boolean;
  supportsErc721Interface: boolean;
  ownerCollectionBalance: string | null;
};

/**
 * Scans recent blocks for ERC-721 Transfer events and returns holdings that are
 * still owned at head.
 *
 * ERC-721 is distinguished from ERC-20 structurally: ERC-721 indexes `tokenId`,
 * so its Transfer log has four topics, while ERC-20's has three. That test
 * needs no allowlist and no provider.
 */
export async function findErc721Holdings(
  client: PublicClient,
  want: number,
  opts: { window?: bigint; maxWindows?: number } = {},
): Promise<{
  found: DiscoveredNft[];
  blocksScanned: number;
  erc721LogsSeen: number;
  collectionsSeen: number;
  error: string | null;
}> {
  // Unfiltered getLogs returns every log in the range, so keep windows small.
  const window = opts.window ?? 50n;
  const maxWindows = opts.maxWindows ?? 12;
  const head = await client.getBlockNumber();

  const found: DiscoveredNft[] = [];
  const triedPairs = new Set<string>();
  const collections = new Set<string>();
  let blocksScanned = 0;
  let erc721LogsSeen = 0;

  for (let i = 0; i < maxWindows && found.length < want; i++) {
    const toBlock = head - window * BigInt(i);
    const fromBlock = toBlock - window + 1n;
    if (fromBlock < 0n) break;

    let logs;
    try {
      // No address filter: we want every Transfer on the chain in this range.
      logs = await client.getLogs({ fromBlock, toBlock });
    } catch (err) {
      return {
        found,
        blocksScanned,
        erc721LogsSeen,
        collectionsSeen: collections.size,
        error: err instanceof Error ? (err.message.split("\n")[0] ?? err.message) : String(err),
      };
    }
    blocksScanned += Number(window);

    // Four topics + Transfer signature == ERC-721 (tokenId is indexed).
    const erc721Logs = logs.filter(
      (l) => l.topics.length === 4 && l.topics[0] === TRANSFER_TOPIC,
    );
    erc721LogsSeen += erc721Logs.length;

    for (const log of [...erc721Logs].reverse()) {
      if (found.length >= want) break;
      const to = log.topics[2];
      const idTopic = log.topics[3];
      if (!to || !idTopic) continue;

      const owner = topicToAddress(to);
      if (owner === ZERO) continue;
      const collection = getAddress(log.address);
      const tokenId = BigInt(idTopic).toString();

      collections.add(collection.toLowerCase());
      const pair = `${collection.toLowerCase()}:${tokenId}`;
      if (triedPairs.has(pair)) continue;
      triedPairs.add(pair);

      // Confirm current ownership on-chain; skip anything that moved on.
      try {
        const currentOwner = await client.readContract({
          address: collection,
          abi: ERC721_ABI,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        });
        if (getAddress(currentOwner) !== owner) continue;
      } catch {
        continue;
      }

      const safeRead = async <T>(
        fn: "name" | "symbol" | "tokenURI",
        args: readonly unknown[] = [],
      ): Promise<T | null> => {
        try {
          return (await client.readContract({
            address: collection,
            abi: ERC721_ABI,
            functionName: fn,
            args: args as [],
          })) as T;
        } catch {
          return null;
        }
      };

      const [supports721, name, symbol, uri, bal] = await Promise.all([
        client
          .readContract({
            address: collection,
            abi: ERC165_ABI,
            functionName: "supportsInterface",
            args: ["0x80ac58cd"],
          })
          .catch(() => false),
        safeRead<string>("name"),
        safeRead<string>("symbol"),
        safeRead<string>("tokenURI", [BigInt(tokenId)]),
        client
          .readContract({
            address: collection,
            abi: ERC721_ABI,
            functionName: "balanceOf",
            args: [owner],
          })
          .catch(() => null),
      ]);

      found.push({
        owner,
        collection,
        tokenId,
        collectionName: name,
        collectionSymbol: symbol,
        tokenUri: uri,
        ownerConfirmedOnChain: true,
        supportsErc721Interface: Boolean(supports721),
        ownerCollectionBalance: bal === null ? null : (bal as bigint).toString(),
      });
    }
  }

  return {
    found,
    blocksScanned,
    erc721LogsSeen,
    collectionsSeen: collections.size,
    error: null,
  };
}
