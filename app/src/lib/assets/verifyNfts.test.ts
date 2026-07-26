import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { verifyNfts } from "./verifyNfts";
import { CURATED_COLLECTIONS } from "@/lib/nft/discovery";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import type { NftCandidate } from "./types";
import type { PortfolioAddress } from "@/lib/types";

const W1 = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;
const W2 = "0xe3A0795381521C177fc8c7723213df7B56A10a31" as PortfolioAddress;
const RECOGNIZED = CURATED_COLLECTIONS[0]!.contractAddress; // on the curated allowlist
const OTHER = "0x1111111111111111111111111111111111111111" as PortfolioAddress;

type Entry = { status: "success"; result: unknown } | { status: "failure"; error: unknown };
const okv = (r: unknown): Entry => ({ status: "success", result: r });
const failv = (msg = "execution reverted"): Entry => ({ status: "failure", error: new Error(msg) });

/** Resolves each multicall entry from (address, fn, args) so tests are
 *  independent of the call order the implementation happens to use. */
type Resolver = (address: string, fn: string, args: readonly unknown[] | undefined) => Entry;
function client(resolve: Resolver, block = 100n): PublicClient {
  return {
    getBlockNumber: async () => block,
    multicall: async (a: { contracts: { address: string; functionName: string; args?: readonly unknown[] }[] }) =>
      a.contracts.map((c) => resolve(c.address, c.functionName, c.args)),
  } as unknown as PublicClient;
}

const nft = (
  address: PortfolioAddress,
  standard: "erc721" | "erc1155",
  wallets: PortfolioAddress[],
  tokenIds: string[],
): NftCandidate => ({ chainId: MONAD_CHAIN_ID, contractAddress: address, standard, wallets, tokenIds, source: "envio" });

describe("verifyNfts — ERC-721", () => {
  it("counts holdings on-chain, enumerates owned ids, marks a curated collection recognized", async () => {
    const res = await verifyNfts(
      client((_a, fn) => {
        if (fn === "supportsInterface") return okv(true);
        if (fn === "name") return okv("Cool Cats");
        if (fn === "balanceOf") return okv(2n); // one wallet, two owned
        if (fn === "ownerOf") return okv(W1); // both discovered ids owned by W1
        return failv();
      }),
      [nft(RECOGNIZED, "erc721", [W1], ["10", "11"])],
      [W1],
    );
    expect(res.collections).toHaveLength(1);
    const c = res.collections[0]!;
    expect(c.standard).toBe("erc721");
    expect(c.total).toBe(2n);
    expect(c.name).toBe("Cool Cats");
    expect(c.metadataQuality).toBe("onchain");
    expect(c.classification).toBe("recognized");
    expect(c.perWallet).toEqual([{ wallet: W1, count: 2n }]);
    expect(c.items).toHaveLength(2);
    expect(c.items!.every((i) => i.wallet === W1 && i.quantity === 1n && i.standard === "erc721")).toBe(true);
    expect(c.partial).toBe(false);
    expect(res.partial).toBe(false);
  });

  it("shows an unknown collection as 'other', never hidden, never 'spam'", async () => {
    const res = await verifyNfts(
      client((_a, fn) => {
        if (fn === "supportsInterface") return okv(true);
        if (fn === "name") return okv("Randoms");
        if (fn === "balanceOf") return okv(1n);
        if (fn === "ownerOf") return okv(W1);
        return failv();
      }),
      [nft(OTHER, "erc721", [W1], ["7"])],
      [W1],
    );
    expect(res.collections[0]!.classification).toBe("other");
  });

  it("excludes a contract whose ERC-165 explicitly denies the interface", async () => {
    const res = await verifyNfts(
      client((_a, fn) => (fn === "supportsInterface" ? okv(false) : okv(0n))),
      [nft(OTHER, "erc721", [W1], ["1"])],
      [W1],
    );
    expect(res.collections).toHaveLength(0);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]!.scope).toBe("contract");
    expect(res.partial).toBe(true);
  });

  it("still counts when ERC-165 reverts (an ERC-20 could never reach a 4-topic Transfer)", async () => {
    const res = await verifyNfts(
      client((_a, fn) => {
        if (fn === "supportsInterface") return failv(); // reverts → unknown, tolerated
        if (fn === "name") return okv("NoIntrospection");
        if (fn === "balanceOf") return okv(1n);
        if (fn === "ownerOf") return okv(W1);
        return failv();
      }),
      [nft(OTHER, "erc721", [W1], ["3"])],
      [W1],
    );
    expect(res.collections).toHaveLength(1);
    expect(res.collections[0]!.total).toBe(1n);
  });

  it("reports a failed count as a failure, never a zero, and keeps the good wallet", async () => {
    const res = await verifyNfts(
      client((_a, fn, args) => {
        if (fn === "supportsInterface") return okv(true);
        if (fn === "name") return okv("N");
        if (fn === "balanceOf") return args?.[0] === W2 ? failv() : okv(3n);
        if (fn === "ownerOf") return okv(W1);
        return failv();
      }),
      [nft(OTHER, "erc721", [W1, W2], ["9"])],
      [W1, W2],
    );
    const c = res.collections[0]!;
    expect(c.total).toBe(3n); // only the successful wallet
    expect(c.perWallet.find((p) => p.wallet === W1)!.count).toBe(3n);
    const w2 = c.perWallet.find((p) => p.wallet === W2)!;
    expect(w2.count).toBeNull();
    expect(w2.error).toBeTruthy();
    expect(c.partial).toBe(true);
    expect(res.partial).toBe(true);
  });

  it("drops a collection with a successful zero balance and nothing owned", async () => {
    const res = await verifyNfts(
      client((_a, fn) => {
        if (fn === "supportsInterface") return okv(true);
        if (fn === "name") return okv("N");
        if (fn === "balanceOf") return okv(0n);
        if (fn === "ownerOf") return okv(W2); // owned by someone else
        return failv();
      }),
      [nft(OTHER, "erc721", [W1], ["1"])],
      [W1],
    );
    expect(res.collections).toHaveLength(0);
    expect(res.partial).toBe(false);
  });

  it("keeps a positive count even when ownerOf enumeration reverts (no items)", async () => {
    const res = await verifyNfts(
      client((_a, fn) => {
        if (fn === "supportsInterface") return okv(true);
        if (fn === "name") return okv("N");
        if (fn === "balanceOf") return okv(2n);
        if (fn === "ownerOf") return failv();
        return failv();
      }),
      [nft(OTHER, "erc721", [W1], ["1", "2"])],
      [W1],
    );
    const c = res.collections[0]!;
    expect(c.total).toBe(2n);
    expect(c.items).toBeUndefined();
  });

  it("keeps the count but flags metadata missing when name() fails", async () => {
    const res = await verifyNfts(
      client((_a, fn) => {
        if (fn === "supportsInterface") return okv(true);
        if (fn === "name") return failv();
        if (fn === "balanceOf") return okv(1n);
        if (fn === "ownerOf") return okv(W1);
        return failv();
      }),
      [nft(OTHER, "erc721", [W1], ["1"])],
      [W1],
    );
    const c = res.collections[0]!;
    expect(c.name).toBeNull();
    expect(c.metadataQuality).toBe("missing");
    expect(c.total).toBe(1n);
  });
});

describe("verifyNfts — ERC-1155", () => {
  it("counts per-id balances, omits zero ids, sums per wallet and total", async () => {
    const res = await verifyNfts(
      client((_a, fn, args) => {
        if (fn === "supportsInterface") return okv(true);
        if (fn === "name") return okv("Items");
        if (fn === "balanceOf") {
          const id = args?.[1] as bigint;
          return okv(id === 1n ? 5n : 0n); // id 1 → 5, id 2 → 0 (dropped)
        }
        return failv();
      }),
      [nft(OTHER, "erc1155", [W1], ["1", "2"])],
      [W1],
    );
    const c = res.collections[0]!;
    expect(c.standard).toBe("erc1155");
    expect(c.total).toBe(5n);
    expect(c.items).toHaveLength(1);
    expect(c.items![0]!.tokenId).toBe("1");
    expect(c.items![0]!.quantity).toBe(5n);
    expect(c.perWallet).toEqual([{ wallet: W1, count: 5n }]);
    expect(c.partial).toBe(false);
  });

  it("reports a failed 1155 read as partial with a wallet error, not a zero", async () => {
    const res = await verifyNfts(
      client((_a, fn, args) => {
        if (fn === "supportsInterface") return okv(true);
        if (fn === "name") return okv("Items");
        if (fn === "balanceOf") return (args?.[1] as bigint) === 2n ? failv() : okv(4n);
        return failv();
      }),
      [nft(OTHER, "erc1155", [W1], ["1", "2"])],
      [W1],
    );
    const c = res.collections[0]!;
    expect(c.total).toBe(4n); // only the id that read
    expect(c.perWallet[0]!.count).toBe(4n);
    expect(c.perWallet[0]!.error).toBeTruthy();
    expect(c.partial).toBe(true);
    expect(res.partial).toBe(true);
  });

  it("drops a 1155 collection when every held balance is a successful zero", async () => {
    const res = await verifyNfts(
      client((_a, fn) => (fn === "balanceOf" ? okv(0n) : fn === "supportsInterface" ? okv(true) : okv("x"))),
      [nft(OTHER, "erc1155", [W1], ["1", "2"])],
      [W1],
    );
    expect(res.collections).toHaveLength(0);
    expect(res.partial).toBe(false);
  });
});

describe("verifyNfts — edges", () => {
  it("returns an empty result (still with a block) for no candidates", async () => {
    const res = await verifyNfts(client(() => okv(0n), 55n), [], [W1]);
    expect(res.collections).toHaveLength(0);
    expect(res.failures).toHaveLength(0);
    expect(res.block).toBe(55n);
  });
});
