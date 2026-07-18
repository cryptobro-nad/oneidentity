import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { checkCollection, checkCollectionWithClient } from "./nft";
import { AllEndpointsFailedError } from "./rpc";
import type { PortfolioAddress } from "./types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;
const C = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946" as PortfolioAddress;

// Real Monad Mainnet ERC-721 (Clober Orderbook Maker Order), verified on-chain.
const COLLECTION = "0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC" as PortfolioAddress;

type Entry = { status: "success"; result: bigint } | { status: "failure"; error: Error };
const success = (result: bigint): Entry => ({ status: "success", result });
const failure = (msg: string): Entry => ({ status: "failure", error: new Error(msg) });

function mockClient(opts: {
  code?: string;
  blockNumber?: bigint;
  results?: Entry[];
  multicallThrows?: Error;
  getCodeThrows?: Error;
  /** ERC-165 supportsInterface(0x80ac58cd). Defaults to a compliant ERC-721. */
  supportsErc721?: boolean;
  supportsInterfaceThrows?: Error;
}): PublicClient {
  return {
    getCode: vi.fn(async () => {
      if (opts.getCodeThrows) throw opts.getCodeThrows;
      return opts.code ?? "0x60806040";
    }),
    readContract: vi.fn(async () => {
      if (opts.supportsInterfaceThrows) throw opts.supportsInterfaceThrows;
      return opts.supportsErc721 ?? true;
    }),
    getBlockNumber: vi.fn(async () => opts.blockNumber ?? 88_613_299n),
    multicall: vi.fn(async () => {
      if (opts.multicallThrows) throw opts.multicallThrows;
      return opts.results ?? [];
    }),
  } as unknown as PublicClient;
}

describe("checkCollectionWithClient", () => {
  it("aggregates a valid ERC-721 collection across wallets", async () => {
    const client = mockClient({ results: [success(2n), success(1n), success(4n)] });

    const result = await checkCollectionWithClient(client, COLLECTION, [A, B, C]);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.total).toBe(7n);
    expect(result.partial).toBe(false);
    expect(result.blockNumber).toBe(88_613_299n);
    expect(result.wallets.map((w) => w.result.rawValue)).toEqual([2n, 1n, 4n]);
  });

  it("reports a non-contract address distinctly", async () => {
    const client = mockClient({ code: "0x" });
    const result = await checkCollectionWithClient(client, COLLECTION, [A]);
    expect(result.status).toBe("not-a-contract");
    // It must not have wasted a multicall on an address with no code.
    expect(client.multicall).not.toHaveBeenCalled();
  });

  it("treats undefined code as a non-contract", async () => {
    const client = {
      getCode: vi.fn(async () => undefined),
      getBlockNumber: vi.fn(async () => 1n),
      multicall: vi.fn(async () => []),
    } as unknown as PublicClient;
    const result = await checkCollectionWithClient(client, COLLECTION, [A]);
    expect(result.status).toBe("not-a-contract");
  });

  it("reports not-erc721 when every balanceOf call reverts", async () => {
    const client = mockClient({
      results: [failure("execution reverted"), failure("execution reverted")],
    });
    const result = await checkCollectionWithClient(client, COLLECTION, [A, B]);
    expect(result.status).toBe("not-erc721");
  });

  it("rejects an ERC-20 token address instead of reporting its balance as NFTs", async () => {
    // ERC-20 shares the balanceOf(address) signature, so without the ERC-165
    // gate a USDC balance of 730865655 would render as "730,865,655 NFTs".
    const client = mockClient({
      supportsErc721: false,
      results: [success(730_865_655n)],
    });

    const result = await checkCollectionWithClient(client, COLLECTION, [A]);

    expect(result.status).toBe("not-erc721");
    // The balance calls must not even be attempted.
    expect(client.multicall).not.toHaveBeenCalled();
  });

  it("rejects a contract with no ERC-165 support at all", async () => {
    const client = mockClient({
      supportsInterfaceThrows: new Error("execution reverted"),
      results: [success(5n)],
    });
    const result = await checkCollectionWithClient(client, COLLECTION, [A]);
    expect(result.status).toBe("not-erc721");
  });

  it("checks ERC-165 before spending a multicall", async () => {
    const client = mockClient({ supportsErc721: true, results: [success(1n)] });
    await checkCollectionWithClient(client, COLLECTION, [A]);
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "supportsInterface", args: ["0x80ac58cd"] }),
    );
  });

  it("returns a partial result when only some wallets fail", async () => {
    const client = mockClient({
      results: [success(3n), failure("execution reverted"), success(4n)],
    });

    const result = await checkCollectionWithClient(client, COLLECTION, [A, B, C]);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.partial).toBe(true);
    // The failed wallet is excluded, not counted as zero.
    expect(result.total).toBe(7n);
    expect(result.wallets[1]?.result.success).toBe(false);
    expect(result.wallets[1]?.result.rawValue).toBeUndefined();
    expect(result.wallets[1]?.result.error).toContain("execution reverted");
  });

  it("treats a genuine zero holding as success", async () => {
    const client = mockClient({ results: [success(0n), success(0n)] });

    const result = await checkCollectionWithClient(client, COLLECTION, [A, B]);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.total).toBe(0n);
    expect(result.partial).toBe(false);
    expect(result.wallets[0]?.result).toEqual({ success: true, rawValue: 0n });
  });

  it("marks a missing multicall entry as failed", async () => {
    const client = mockClient({ results: [success(1n)] }); // second entry missing
    const result = await checkCollectionWithClient(client, COLLECTION, [A, B]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.partial).toBe(true);
    expect(result.wallets[1]?.result.success).toBe(false);
  });
});

describe("checkCollection RPC fallback", () => {
  it("falls back when the primary endpoint fails", async () => {
    const factory = vi.fn((url: string) =>
      url === "https://primary.test"
        ? mockClient({ getCodeThrows: new Error("primary down") })
        : mockClient({ results: [success(5n)] }),
    );

    const result = await checkCollection(COLLECTION, [A], {
      endpoints: ["https://primary.test", "https://fallback.test"],
      clientFactory: factory,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.endpointUsed).toBe("https://fallback.test");
    expect(result.total).toBe(5n);
  });

  it("throws when both endpoints fail", async () => {
    const factory = vi.fn(() => mockClient({ getCodeThrows: new Error("down") }));
    await expect(
      checkCollection(COLLECTION, [A], {
        endpoints: ["https://primary.test", "https://fallback.test"],
        clientFactory: factory,
      }),
    ).rejects.toBeInstanceOf(AllEndpointsFailedError);
  });

  it("does not fail over for a not-erc721 verdict", async () => {
    // A contract that exists but is not ERC-721 is a real answer.
    const factory = vi.fn(() => mockClient({ results: [failure("reverted")] }));

    const result = await checkCollection(COLLECTION, [A], {
      endpoints: ["https://primary.test", "https://fallback.test"],
      clientFactory: factory,
    });

    expect(result.status).toBe("not-erc721");
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
