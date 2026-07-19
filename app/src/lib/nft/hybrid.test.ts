import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { loadHybridNftHoldings } from "./hybrid";
import {
  BlockVisionDiscovery,
  CuratedDiscovery,
  type DiscoveredCollection,
  type DiscoveryBlockReason,
  type DiscoveryOutcome,
  type NftDiscoveryProvider,
} from "./discovery";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";

const W1 = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const W2 = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

const COL_A = "0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC" as PortfolioAddress;
const COL_B = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" as PortfolioAddress;

const collection = (
  address: PortfolioAddress,
  name: string | null = null,
): DiscoveredCollection => ({
  chainId: MONAD_CHAIN_ID,
  contractAddress: address,
  name,
  claimedQty: null,
});

function stubProvider(
  outcomes: Record<
    string,
    DiscoveredCollection[] | { error: string; blocked?: boolean; reason?: DiscoveryBlockReason }
  >,
): NftDiscoveryProvider {
  const discover = async (wallet: PortfolioAddress): Promise<DiscoveryOutcome> => {
    const entry = outcomes[wallet.toLowerCase()];
    if (!entry) return { ok: true, wallet, collections: [] };
    if (Array.isArray(entry)) return { ok: true, wallet, collections: entry };
    return {
      ok: false,
      wallet,
      error: entry.error,
      blocked: entry.blocked ?? false,
      reason: entry.reason ?? "error",
    };
  };

  return {
    name: "stub",
    configured: true,
    reproduceCommand: () => "stub",
    discover: vi.fn(discover),
  };
}

type Entry = { status: "success"; result: unknown } | { status: "failure"; error: unknown };
const ok = (result: unknown): Entry => ({ status: "success", result });
const fail = (msg: string): Entry => ({ status: "failure", error: new Error(msg) });

/** balances: [collection][wallet]; meta: per collection [supports721, name]. */
function mockClient(balances: Entry[], meta: Entry[], blockNumber = 88_700_000n): PublicClient {
  const calls: Entry[][] = [balances, meta];
  let call = 0;
  return {
    getBlockNumber: vi.fn(async () => blockNumber),
    multicall: vi.fn(async () => calls[call++] ?? []),
  } as unknown as PublicClient;
}

describe("hybrid discovery + on-chain verification", () => {
  it("verifies a discovered collection across both wallets", async () => {
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A, "10K Squad")] });
    const client = mockClient(
      [ok(5n), ok(0n)],
      [ok(true), ok("10K Squad")],
    );

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);

    expect(result.collections).toHaveLength(1);
    const first = result.collections[0]!;
    expect(first.total).toBe(5n);
    expect(first.name).toBe("10K Squad");
    expect(first.nameSource).toBe("onchain");
    expect(first.partial).toBe(false);
    expect(first.perWallet.map((w) => w.count)).toEqual([5n, 0n]);
  });

  it("checks a collection found for one wallet against ALL wallets", async () => {
    // The combined view is the point: wallet B's holding must be counted even
    // though only wallet A's index mentioned the collection.
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A)] });
    const client = mockClient([ok(2n), ok(3n)], [ok(true), ok("Skrumpy")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);

    expect(result.collections[0]!.total).toBe(5n);
    expect(result.collections[0]!.perWallet).toHaveLength(2);
  });

  it("deduplicates a collection reported for both wallets", async () => {
    const provider = stubProvider({
      [W1.toLowerCase()]: [collection(COL_A, "Dup")],
      [W2.toLowerCase()]: [collection(COL_A.toLowerCase() as PortfolioAddress, "Dup")],
    });
    const client = mockClient([ok(1n), ok(1n)], [ok(true), ok("Dup")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);

    expect(result.candidatesConsidered).toBe(1);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0]!.total).toBe(2n);
  });

  it("sorts collections by total descending", async () => {
    const provider = stubProvider({
      [W1.toLowerCase()]: [collection(COL_A, "Few"), collection(COL_B, "Many")],
    });
    const client = mockClient(
      [ok(1n), ok(0n), ok(9n), ok(0n)],
      [ok(true), ok("Few"), ok(true), ok("Many")],
    );

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);
    expect(result.collections.map((c) => c.name)).toEqual(["Many", "Few"]);
  });

  it("never counts a failed balance read as zero", async () => {
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A, "X")] });
    const client = mockClient([ok(4n), fail("execution reverted")], [ok(true), ok("X")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);
    const c = result.collections[0]!;

    expect(c.total).toBe(4n); // the failed wallet is excluded, not added as 0
    expect(c.partial).toBe(true);
    expect(c.perWallet[1]!.count).toBeNull();
    expect(c.perWallet[1]!.error).toContain("execution reverted");
    expect(result.verificationPartial).toBe(true);
  });

  it("keeps a collection visible when a read failed even if the total is zero", async () => {
    // Otherwise a failure would be indistinguishable from "holds none".
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A, "X")] });
    const client = mockClient([fail("rpc down"), ok(0n)], [ok(true), ok("X")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0]!.partial).toBe(true);
  });

  it("hides collections genuinely held zero times", async () => {
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A, "X")] });
    const client = mockClient([ok(0n), ok(0n)], [ok(true), ok("X")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);
    expect(result.collections).toHaveLength(0);
  });

  it("surfaces discovery failure without pretending the wallet holds nothing", async () => {
    const provider = stubProvider({
      [W1.toLowerCase()]: { error: "HTTP 403", blocked: true },
      [W2.toLowerCase()]: [collection(COL_A, "X")],
    });
    const client = mockClient([ok(0n), ok(2n)], [ok(true), ok("X")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);

    expect(result.discoveryPartial).toBe(true);
    expect(result.discoveryFailures).toHaveLength(1);
    expect(result.discoveryFailures[0]!.blocked).toBe(true);
    expect(result.discoveryFailures[0]!.wallet).toBe(W1);
  });

  it("prefers the on-chain name over the indexer label", async () => {
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A, "Indexer Label")] });
    const client = mockClient([ok(1n), ok(0n)], [ok(true), ok("Onchain Name")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);
    expect(result.collections[0]!.name).toBe("Onchain Name");
    expect(result.collections[0]!.nameSource).toBe("onchain");
  });

  it("falls back to the indexer name when name() is unavailable", async () => {
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A, "Indexer Label")] });
    const client = mockClient([ok(1n), ok(0n)], [ok(true), fail("no name()")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);
    expect(result.collections[0]!.name).toBe("Indexer Label");
    expect(result.collections[0]!.nameSource).toBe("indexer");
  });

  it("flags a non-ERC-721 contract", async () => {
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A, "Token?")] });
    const client = mockClient([ok(7n), ok(0n)], [ok(false), ok("Some ERC20")]);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);
    expect(result.collections[0]!.isErc721).toBe(false);
  });

  it("accepts extra user-entered collections alongside discovery", async () => {
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A, "Discovered")] });
    const client = mockClient(
      [ok(1n), ok(0n), ok(2n), ok(0n)],
      [ok(true), ok("Discovered"), ok(true), ok("Manual")],
    );

    const result = await loadHybridNftHoldings(client, [W1, W2], provider, {
      extraCollections: [collection(COL_B, "Manual")],
    });

    expect(result.candidatesConsidered).toBe(2);
    expect(result.collections).toHaveLength(2);
  });

  it("pins every read to one block", async () => {
    const provider = stubProvider({ [W1.toLowerCase()]: [collection(COL_A)] });
    const client = mockClient([ok(1n), ok(0n)], [ok(true), ok("X")], 12345n);

    const result = await loadHybridNftHoldings(client, [W1, W2], provider);

    expect(result.blockNumber).toBe(12345n);
    expect(client.multicall).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: 12345n }),
    );
  });

  it("handles zero candidates without calling multicall", async () => {
    const provider = stubProvider({});
    const client = mockClient([], []);

    const result = await loadHybridNftHoldings(client, [W1], provider);

    expect(result.collections).toEqual([]);
    expect(result.candidatesConsidered).toBe(0);
    expect(client.multicall).not.toHaveBeenCalled();
  });
});

describe("BlockVisionDiscovery", () => {
  it("reports blocked when no API key is configured", async () => {
    const provider = new BlockVisionDiscovery(undefined);
    expect(provider.configured).toBe(false);

    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.blocked).toBe(true);
  });

  it("emits an exact reproduce command", () => {
    const provider = new BlockVisionDiscovery(undefined);
    const cmd = provider.reproduceCommand(W1);
    expect(cmd).toContain("api.blockvision.org/v2/monad/account/nfts");
    expect(cmd).toContain(W1);
    expect(cmd).toContain("x-api-key");
  });

  it("treats 403 as blocked, not as an empty wallet", async () => {
    const provider = new BlockVisionDiscovery("key");
    const fetchMock = vi.fn(async () => new Response("", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.blocked).toBe(true);
    vi.unstubAllGlobals();
  });

  it("paginates until nextPageIndex is null and dedupes by contract", async () => {
    const provider = new BlockVisionDiscovery("key");
    const pages = [
      {
        result: {
          data: [
            { contractAddress: COL_A, name: "A", qty: 2, ercStandard: "ERC721" },
            { contractAddress: COL_A, name: "A", qty: 1, ercStandard: "ERC721" },
          ],
          nextPageIndex: 2,
        },
      },
      {
        result: {
          data: [{ contractAddress: COL_B, name: "B", qty: 4, ercStandard: "ERC721" }],
          nextPageIndex: null,
        },
      },
    ];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(pages[call++]), { status: 200 })),
    );

    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.collections).toHaveLength(2);
    // Two entries for the same contract collapse into one candidate.
    expect(outcome.collections[0]!.claimedQty).toBe(3);
    vi.unstubAllGlobals();
  });

  it("distinguishes a Pro-tier requirement from an empty wallet", async () => {
    // Measured live: code -32609 with a valid free-tier key. This must never be
    // rendered as "this wallet holds no NFTs".
    const provider = new BlockVisionDiscovery("key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: -32609,
              message:
                "Your 30 trial requests have been used. The Monad Mainnet Indexing API is available only to Pro-tier users.",
            }),
            { status: 403 },
          ),
      ),
    );

    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("tier-required");
    expect(outcome.blocked).toBe(true);
    vi.unstubAllGlobals();
  });

  it("reports a missing credential distinctly from a tier problem", async () => {
    const provider = new BlockVisionDiscovery("key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: -32002, message: "apikey must" }), { status: 403 }),
      ),
    );

    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("no-key");
    vi.unstubAllGlobals();
  });

  it("reports rate limiting as retryable, not blocked", async () => {
    const provider = new BlockVisionDiscovery("key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "slow down" }), { status: 429 })),
    );

    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("rate-limited");
    expect(outcome.blocked).toBe(false);
    vi.unstubAllGlobals();
  });

  it("times out rather than hanging the page", async () => {
    const provider = new BlockVisionDiscovery("key", 20, 50);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      ),
    );

    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/did not respond within/);
    expect(outcome.reason).toBe("error");
    vi.unstubAllGlobals();
  });

  it("skips non-ERC-721 standards", async () => {
    const provider = new BlockVisionDiscovery("key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                data: [
                  { contractAddress: COL_A, name: "A", qty: 1, ercStandard: "ERC1155" },
                  { contractAddress: COL_B, name: "B", qty: 1, ercStandard: "ERC721" },
                ],
                nextPageIndex: null,
              },
            }),
            { status: 200 },
          ),
      ),
    );

    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.collections).toHaveLength(1);
    expect(outcome.collections[0]!.contractAddress.toLowerCase()).toBe(COL_B.toLowerCase());
    vi.unstubAllGlobals();
  });
});

describe("CuratedDiscovery fallback", () => {
  it("is always configured and returns the curated list", async () => {
    const provider = new CuratedDiscovery();
    expect(provider.configured).toBe(true);
    const outcome = await provider.discover(W1);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.collections.length).toBeGreaterThan(0);
  });
});
