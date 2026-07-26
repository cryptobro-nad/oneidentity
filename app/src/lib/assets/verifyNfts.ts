/**
 * RPC verification of ERC-721 / ERC-1155 candidates.
 *
 * Discovery only proposes NFT contracts (and, where a Transfer exposed them,
 * token ids). Truth comes from here, the same way `verify.ts` handles fungibles
 * and `nft.ts` handles a pasted collection: every count is re-read on-chain at a
 * single pinned block, a FAILED read is reported as a failure (never a zero),
 * and a successful zero is dropped.
 *
 * Standard is confirmed with ERC-165 before counting: an explicit `false` for
 * the claimed interface excludes the candidate, so a mislabelled contract can
 * never be counted as the wrong standard. A reverting ERC-165 (many valid NFTs
 * do not implement it) is tolerated — the candidate reached us from a
 * Transfer-shaped log that an ERC-20 cannot emit, so the topic-count
 * classification already rules ERC-20 out.
 *
 * Names come from an on-chain `name()`; per-token metadata (tokenURI/images) is
 * deliberately NOT fetched here.
 */

import { getAddress, parseAbi, type PublicClient } from "viem";
import { errorText } from "@/lib/rpc";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import { CURATED_COLLECTIONS } from "@/lib/nft/discovery";
import type { PortfolioAddress } from "@/lib/types";
import type {
  NftCandidate,
  NftCollectionHolding,
  NftItemHolding,
  PartialFailure,
} from "./types";

type MulticallEntry = { status: "success"; result: unknown } | { status: "failure"; error: unknown };

/** ERC-165 interface ids for the standards we count. */
export const ERC721_INTERFACE_ID = "0x80ac58cd" as const;
export const ERC1155_INTERFACE_ID = "0xd9b67a26" as const;

/** Only the reads we make. `balanceOf` is overloaded across the two standards. */
const NFT_ABI = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function name() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
]);

/** Curated collections are "recognized"; everything else is "other" (shown,
 *  never hidden merely for being unknown, never called "spam"). */
const RECOGNIZED = new Set(CURATED_COLLECTIONS.map((c) => c.contractAddress.toLowerCase()));

export type NftVerification = {
  collections: NftCollectionHolding[];
  failures: PartialFailure[];
  block: bigint;
  partial: boolean;
};

type Call = { address: PortfolioAddress; abi: typeof NFT_ABI; functionName: string; args?: readonly unknown[] };

async function batch(client: PublicClient, contracts: Call[], blockNumber: bigint): Promise<MulticallEntry[]> {
  if (contracts.length === 0) return [];
  return (await client.multicall({ contracts, allowFailure: true, blockNumber })) as MulticallEntry[];
}

const asBool = (e?: MulticallEntry) => (e?.status === "success" ? Boolean(e.result) : null);
const asString = (e?: MulticallEntry) => (e?.status === "success" ? String(e.result) : null);
const asBig = (e?: MulticallEntry) => (e?.status === "success" ? (e.result as bigint) : null);
const asAddr = (e?: MulticallEntry) => {
  if (e?.status !== "success") return null;
  try {
    return getAddress(String(e.result)) as PortfolioAddress;
  } catch {
    return null;
  }
};

/** A candidate that survived the ERC-165 gate, with its original row index. */
type Active = { c: NftCandidate; i: number };

export async function verifyNfts(
  client: PublicClient,
  candidates: readonly NftCandidate[],
  wallets: readonly PortfolioAddress[],
): Promise<NftVerification> {
  const failures: PartialFailure[] = [];
  const collections: NftCollectionHolding[] = [];

  if (candidates.length === 0) {
    return { collections, failures, block: await client.getBlockNumber(), partial: false };
  }

  const walletList = wallets.map((w) => getAddress(w) as PortfolioAddress);
  const walletSet = new Set(walletList.map((w) => w.toLowerCase()));
  const blockNumber = await client.getBlockNumber();
  let partial = false;

  // ---- Phase 1 & 2: interface confirmation and name() ----------------------
  const gate = await batch(
    client,
    candidates.map((c) => ({
      address: c.contractAddress,
      abi: NFT_ABI,
      functionName: "supportsInterface",
      args: [c.standard === "erc721" ? ERC721_INTERFACE_ID : ERC1155_INTERFACE_ID],
    })),
    blockNumber,
  );
  const names = await batch(
    client,
    candidates.map((c) => ({ address: c.contractAddress, abi: NFT_ABI, functionName: "name" })),
    blockNumber,
  );

  const active: Active[] = [];
  candidates.forEach((c, i) => {
    if (asBool(gate[i]) === false) {
      // Active denial of the claimed interface → never count it as that type.
      failures.push({
        scope: "contract",
        contract: c.contractAddress,
        reason: `contract does not report ${c.standard} support (ERC-165)`,
        blocked: false,
      });
      partial = true;
      return;
    }
    active.push({ c, i }); // true or unknown (reverting ERC-165) → proceed
  });

  const erc721 = active.filter((a) => a.c.standard === "erc721");
  const erc1155 = active.filter((a) => a.c.standard === "erc1155");

  const metaFor = (a: Active) => {
    const name = asString(names[a.i]);
    const recognized = RECOGNIZED.has(a.c.contractAddress.toLowerCase());
    return {
      name,
      metadataQuality: (name !== null ? "onchain" : "missing") as NftCollectionHolding["metadataQuality"],
      classification: (recognized ? "recognized" : "other") as NftCollectionHolding["classification"],
    };
  };

  // ---- ERC-721: balanceOf(wallet) exact count, ownerOf(id) enumeration -----
  if (erc721.length > 0) {
    const balDesc = erc721.flatMap((a) => walletList.map((wallet) => ({ a, wallet })));
    const ownerDesc = erc721.flatMap((a) => a.c.tokenIds.map((id) => ({ a, id })));
    const [bal, owners] = await Promise.all([
      batch(
        client,
        balDesc.map(({ a, wallet }) => ({
          address: a.c.contractAddress, abi: NFT_ABI, functionName: "balanceOf", args: [wallet],
        })),
        blockNumber,
      ),
      batch(
        client,
        ownerDesc.map(({ a, id }) => ({
          address: a.c.contractAddress, abi: NFT_ABI, functionName: "ownerOf", args: [BigInt(id)],
        })),
        blockNumber,
      ),
    ]);

    type Acc = { total: bigint; anyError: boolean; perWallet: Map<string, { count: bigint | null; error?: string }>; items: NftItemHolding[] };
    const accs = new Map<Active, Acc>();
    erc721.forEach((a) => accs.set(a, { total: 0n, anyError: false, perWallet: new Map(), items: [] }));

    balDesc.forEach(({ a, wallet }, idx) => {
      const acc = accs.get(a)!;
      const entry = bal[idx];
      const count = asBig(entry);
      if (count === null) {
        acc.anyError = true;
        acc.perWallet.set(wallet.toLowerCase(), {
          count: null,
          error: entry?.status === "failure" ? errorText(entry.error) : "no result",
        });
      } else {
        acc.total += count;
        acc.perWallet.set(wallet.toLowerCase(), { count });
      }
    });

    ownerDesc.forEach(({ a, id }, idx) => {
      const owner = asAddr(owners[idx]);
      if (owner && walletSet.has(owner.toLowerCase())) {
        accs.get(a)!.items.push({
          chainId: MONAD_CHAIN_ID, wallet: owner, contractAddress: a.c.contractAddress,
          standard: "erc721", tokenId: id, quantity: 1n, metadataQuality: "missing",
        });
      }
      // ownerOf revert / owned elsewhere → token moved on; not a failure.
    });

    erc721.forEach((a) => {
      const acc = accs.get(a)!;
      if (acc.anyError) partial = true;
      if (acc.total === 0n && acc.items.length === 0 && !acc.anyError) return; // successful empty → drop
      const meta = metaFor(a);
      collections.push({
        chainId: MONAD_CHAIN_ID, contractAddress: a.c.contractAddress, standard: "erc721",
        name: meta.name, metadataQuality: meta.metadataQuality, classification: meta.classification,
        discoverySource: a.c.source, total: acc.total,
        perWallet: walletList.map((w) => ({ wallet: w, ...(acc.perWallet.get(w.toLowerCase()) ?? { count: 0n }) })),
        items: acc.items.length > 0 ? acc.items : undefined,
        partial: acc.anyError,
      });
    });
  }

  // ---- ERC-1155: balanceOf(wallet, id) per discovered id -------------------
  if (erc1155.length > 0) {
    const balDesc = erc1155.flatMap((a) =>
      walletList.flatMap((wallet) => a.c.tokenIds.map((id) => ({ a, wallet, id }))),
    );
    const bal = await batch(
      client,
      balDesc.map(({ a, wallet, id }) => ({
        address: a.c.contractAddress, abi: NFT_ABI, functionName: "balanceOf", args: [wallet, BigInt(id)],
      })),
      blockNumber,
    );

    type Acc = { total: bigint; anyError: boolean; walletSum: Map<string, bigint>; walletError: Map<string, string>; items: NftItemHolding[] };
    const accs = new Map<Active, Acc>();
    erc1155.forEach((a) => accs.set(a, { total: 0n, anyError: false, walletSum: new Map(), walletError: new Map(), items: [] }));

    balDesc.forEach(({ a, wallet, id }, idx) => {
      const acc = accs.get(a)!;
      const key = wallet.toLowerCase();
      const entry = bal[idx];
      const qty = asBig(entry);
      if (qty === null) {
        acc.anyError = true;
        acc.walletError.set(key, entry?.status === "failure" ? errorText(entry.error) : "no result");
        return;
      }
      if (qty === 0n) return; // successful zero → omit item
      acc.total += qty;
      acc.walletSum.set(key, (acc.walletSum.get(key) ?? 0n) + qty);
      acc.items.push({
        chainId: MONAD_CHAIN_ID, wallet, contractAddress: a.c.contractAddress,
        standard: "erc1155", tokenId: id, quantity: qty, metadataQuality: "missing",
      });
    });

    erc1155.forEach((a) => {
      const acc = accs.get(a)!;
      if (acc.anyError) partial = true;
      if (acc.total === 0n && acc.items.length === 0 && !acc.anyError) return;
      const meta = metaFor(a);
      collections.push({
        chainId: MONAD_CHAIN_ID, contractAddress: a.c.contractAddress, standard: "erc1155",
        name: meta.name, metadataQuality: meta.metadataQuality, classification: meta.classification,
        discoverySource: a.c.source, total: acc.total,
        perWallet: walletList.map((w) => {
          const key = w.toLowerCase();
          const error = acc.walletError.get(key);
          const count = acc.walletSum.get(key) ?? 0n;
          return error ? { wallet: w, count, error } : { wallet: w, count };
        }),
        items: acc.items.length > 0 ? acc.items : undefined,
        partial: acc.anyError,
      });
    });
  }

  return { collections, failures, block: blockNumber, partial };
}
