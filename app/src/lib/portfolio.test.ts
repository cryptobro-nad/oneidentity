import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { loadPortfolio, loadPortfolioWithClient } from "./portfolio";
import { AllEndpointsFailedError } from "./rpc";
import { collectFailedReads } from "./types";
import type { PortfolioAddress } from "./types";
import type { SupportedStablecoin } from "./tokens";
import { MONAD_CHAIN_ID } from "./chain";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

const TOKENS: readonly SupportedStablecoin[] = [
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0xe7cd86e13AC4309349F30B3435a9d337750fC82D",
    name: "USDT0",
    symbol: "USDT0",
    decimals: 6,
  },
];

type MulticallEntry =
  | { status: "success"; result: bigint }
  | { status: "failure"; error: Error };

/**
 * A fake viem client. `multicallResults` is ordered exactly as
 * loadPortfolioWithClient builds it: token-major, wallet-minor.
 */
function mockClient(opts: {
  blockNumber?: bigint;
  balances?: Record<string, bigint | Error>;
  multicallResults?: MulticallEntry[];
  multicallThrows?: Error;
  getCode?: string;
}): PublicClient {
  return {
    getBlockNumber: vi.fn(async () => opts.blockNumber ?? 88_613_299n),
    getBalance: vi.fn(async ({ address }: { address: string }) => {
      const value = opts.balances?.[address];
      if (value instanceof Error) throw value;
      return value ?? 0n;
    }),
    getCode: vi.fn(async () => opts.getCode ?? "0x60806040"),
    multicall: vi.fn(async () => {
      if (opts.multicallThrows) throw opts.multicallThrows;
      return opts.multicallResults ?? [];
    }),
  } as unknown as PublicClient;
}

const success = (result: bigint): MulticallEntry => ({ status: "success", result });
const failure = (msg: string): MulticallEntry => ({ status: "failure", error: new Error(msg) });

describe("loadPortfolioWithClient", () => {
  it("aggregates a single wallet", async () => {
    const client = mockClient({
      balances: { [A]: 1_000_000_000_000_000_000n },
      multicallResults: [success(5_000_000n), success(3_000_000n)],
    });

    const result = await loadPortfolioWithClient(client, [A], TOKENS);

    expect(result.partial).toBe(false);
    expect(result.blockNumber).toBe(88_613_299n);
    expect(result.totals.MON).toBe(1_000_000_000_000_000_000n);
    expect(result.totals.USDC).toBe(5_000_000n);
    expect(result.totals.USDT0).toBe(3_000_000n);
  });

  it("aggregates totals across five wallets", async () => {
    const wallets = [
      A,
      B,
      "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946",
      "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799",
      "0xd651346d7c789536ebf06dc72aE3C8502cd695CC",
    ] as PortfolioAddress[];

    const client = mockClient({
      balances: Object.fromEntries(wallets.map((w) => [w, 2_000_000_000_000_000_000n])),
      multicallResults: [
        // USDC across five wallets
        success(1_000_000n),
        success(2_000_000n),
        success(3_000_000n),
        success(4_000_000n),
        success(5_000_000n),
        // USDT0 across five wallets
        success(10n),
        success(20n),
        success(30n),
        success(40n),
        success(50n),
      ],
    });

    const result = await loadPortfolioWithClient(client, wallets, TOKENS);

    expect(result.wallets).toHaveLength(5);
    expect(result.partial).toBe(false);
    expect(result.totals.MON).toBe(10_000_000_000_000_000_000n);
    expect(result.totals.USDC).toBe(15_000_000n);
    expect(result.totals.USDT0).toBe(150n);
  });

  it("maps multicall results to the right wallet and token", async () => {
    const client = mockClient({
      balances: { [A]: 0n, [B]: 0n },
      multicallResults: [
        success(111n), // USDC / A
        success(222n), // USDC / B
        success(333n), // USDT0 / A
        success(444n), // USDT0 / B
      ],
    });

    const result = await loadPortfolioWithClient(client, [A, B], TOKENS);

    expect(result.wallets[0]?.stablecoins.USDC?.rawValue).toBe(111n);
    expect(result.wallets[1]?.stablecoins.USDC?.rawValue).toBe(222n);
    expect(result.wallets[0]?.stablecoins.USDT0?.rawValue).toBe(333n);
    expect(result.wallets[1]?.stablecoins.USDT0?.rawValue).toBe(444n);
  });

  it("treats a successful zero balance as success, not failure", async () => {
    const client = mockClient({
      balances: { [A]: 0n },
      multicallResults: [success(0n), success(0n)],
    });

    const result = await loadPortfolioWithClient(client, [A], TOKENS);

    expect(result.partial).toBe(false);
    expect(result.wallets[0]?.mon).toEqual({ success: true, rawValue: 0n });
    expect(result.wallets[0]?.stablecoins.USDC).toEqual({ success: true, rawValue: 0n });
    expect(result.totals.USDC).toBe(0n);
  });

  it("surfaces a failed stablecoin call instead of counting it as zero", async () => {
    const client = mockClient({
      balances: { [A]: 100n, [B]: 200n },
      multicallResults: [
        success(1_000_000n), // USDC / A
        failure("execution reverted"), // USDC / B
        success(7n), // USDT0 / A
        success(8n), // USDT0 / B
      ],
    });

    const result = await loadPortfolioWithClient(client, [A, B], TOKENS);

    expect(result.partial).toBe(true);
    expect(result.wallets[1]?.stablecoins.USDC?.success).toBe(false);
    expect(result.wallets[1]?.stablecoins.USDC?.rawValue).toBeUndefined();
    expect(result.wallets[1]?.stablecoins.USDC?.error).toContain("execution reverted");
    // The failed wallet is excluded from the total rather than added as 0.
    expect(result.totals.USDC).toBe(1_000_000n);
  });

  it("surfaces a failed native balance call", async () => {
    const client = mockClient({
      balances: { [A]: new Error("connection reset"), [B]: 500n },
      multicallResults: [success(1n), success(2n), success(3n), success(4n)],
    });

    const result = await loadPortfolioWithClient(client, [A, B], TOKENS);

    expect(result.partial).toBe(true);
    expect(result.wallets[0]?.mon.success).toBe(false);
    expect(result.wallets[0]?.mon.error).toContain("connection reset");
    expect(result.totals.MON).toBe(500n);
  });

  it("marks a missing multicall entry as failed", async () => {
    const client = mockClient({
      balances: { [A]: 0n },
      multicallResults: [success(1n)], // second token's entry missing
    });

    const result = await loadPortfolioWithClient(client, [A], TOKENS);

    expect(result.partial).toBe(true);
    expect(result.wallets[0]?.stablecoins.USDT0?.success).toBe(false);
  });

  it("handles an empty wallet list without inventing values", async () => {
    const client = mockClient({ multicallResults: [] });
    const result = await loadPortfolioWithClient(client, [], TOKENS);

    expect(result.wallets).toEqual([]);
    expect(result.partial).toBe(false);
    expect(result.totals.MON).toBe(0n);
    expect(result.totals.USDC).toBe(0n);
  });

  it("pins every read to one block number", async () => {
    const client = mockClient({
      blockNumber: 12_345n,
      balances: { [A]: 1n },
      multicallResults: [success(1n), success(1n)],
    });

    await loadPortfolioWithClient(client, [A], TOKENS);

    expect(client.getBalance).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: 12_345n }),
    );
    expect(client.multicall).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: 12_345n }),
    );
  });
});

describe("loadPortfolio RPC fallback", () => {
  const workingClient = () =>
    mockClient({
      balances: { [A]: 42n },
      multicallResults: [success(1n), success(2n)],
    });

  it("uses the primary endpoint when it works", async () => {
    const factory = vi.fn(() => workingClient());

    const result = await loadPortfolio([A], {
      endpoints: ["https://primary.test", "https://fallback.test"],
      clientFactory: factory,
      tokens: TOKENS,
    });

    expect(result.endpointUsed).toBe("https://primary.test");
    expect(result.failedEndpoints).toEqual([]);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("falls back to the second endpoint when the primary fails", async () => {
    const factory = vi.fn((url: string) => {
      if (url === "https://primary.test") {
        return mockClient({ multicallThrows: new Error("primary is down") });
      }
      return workingClient();
    });

    const result = await loadPortfolio([A], {
      endpoints: ["https://primary.test", "https://fallback.test"],
      clientFactory: factory,
      tokens: TOKENS,
    });

    expect(result.endpointUsed).toBe("https://fallback.test");
    expect(result.failedEndpoints).toHaveLength(1);
    expect(result.failedEndpoints[0]?.url).toBe("https://primary.test");
    expect(result.failedEndpoints[0]?.error).toContain("primary is down");
    expect(result.totals.MON).toBe(42n);
  });

  it("throws AllEndpointsFailedError when both endpoints fail, fabricating nothing", async () => {
    const factory = vi.fn(() => mockClient({ multicallThrows: new Error("node unreachable") }));

    await expect(
      loadPortfolio([A], {
        endpoints: ["https://primary.test", "https://fallback.test"],
        clientFactory: factory,
        tokens: TOKENS,
      }),
    ).rejects.toBeInstanceOf(AllEndpointsFailedError);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("records both failures on total failure", async () => {
    const factory = vi.fn(() => mockClient({ multicallThrows: new Error("boom") }));
    let caught: AllEndpointsFailedError | undefined;
    try {
      await loadPortfolio([A], {
        endpoints: ["https://primary.test", "https://fallback.test"],
        clientFactory: factory,
        tokens: TOKENS,
      });
    } catch (err) {
      caught = err as AllEndpointsFailedError;
    }
    expect(caught?.failures).toHaveLength(2);
    expect(caught?.failures.map((f) => f.url)).toEqual([
      "https://primary.test",
      "https://fallback.test",
    ]);
  });

  it("does not fail over for a contract-level failure inside multicall", async () => {
    // A reverting token is a real answer, not an RPC fault: retrying the other
    // endpoint would return the same revert while hiding it from the user.
    const factory = vi.fn(() =>
      mockClient({
        balances: { [A]: 1n },
        multicallResults: [failure("execution reverted"), success(5n)],
      }),
    );

    const result = await loadPortfolio([A], {
      endpoints: ["https://primary.test", "https://fallback.test"],
      clientFactory: factory,
      tokens: TOKENS,
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(result.endpointUsed).toBe("https://primary.test");
    expect(result.partial).toBe(true);
  });
});

describe("collectFailedReads", () => {
  it("lists every failed read with its wallet and symbol", async () => {
    const client = mockClient({
      balances: { [A]: new Error("native down"), [B]: 1n },
      multicallResults: [
        failure("usdc failed"), // USDC / A
        success(2n), // USDC / B
        success(3n), // USDT0 / A
        success(4n), // USDT0 / B
      ],
    });

    const partial = await loadPortfolioWithClient(client, [A, B], TOKENS);
    const failures = collectFailedReads({
      ...partial,
      endpointUsed: "test",
      failedEndpoints: [],
      fetchedAt: 0,
    });

    expect(failures).toHaveLength(2);
    expect(failures).toContainEqual(
      expect.objectContaining({ address: A, symbol: "MON" }),
    );
    expect(failures).toContainEqual(
      expect.objectContaining({ address: A, symbol: "USDC" }),
    );
  });

  it("returns nothing when every read succeeded", async () => {
    const client = mockClient({
      balances: { [A]: 1n },
      multicallResults: [success(1n), success(2n)],
    });
    const full = await loadPortfolioWithClient(client, [A], TOKENS);
    expect(
      collectFailedReads({ ...full, endpointUsed: "t", failedEndpoints: [], fetchedAt: 0 }),
    ).toEqual([]);
  });
});
