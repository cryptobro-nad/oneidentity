import { describe, expect, it, vi } from "vitest";
import { OnChainLogDiscovery } from "./onchainDiscovery";
import type { PortfolioAddress } from "@/lib/types";

const W = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const COL_A = "0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC";
const COL_B = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** ERC-721 Transfer: 4 topics (tokenId indexed). */
const erc721Log = (address: string) => ({
  address,
  topics: [TRANSFER, "0x0", "0x0", "0x1"],
});
/** ERC-20 Transfer: 3 topics. */
const erc20Log = (address: string) => ({
  address,
  topics: [TRANSFER, "0x0", "0x0"],
});

/** Queues JSON-RPC responses in order. */
function stubRpc(responses: unknown[]) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const body = responses[Math.min(i++, responses.length - 1)];
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

const head = (n: number) => ({ result: `0x${n.toString(16)}` });

describe("OnChainLogDiscovery", () => {
  it("finds ERC-721 collections and ignores ERC-20 transfers", async () => {
    stubRpc([
      head(1000),
      { result: [erc721Log(COL_A), erc20Log("0xdead"), erc721Log(COL_B)] },
    ]);

    const outcome = await new OnChainLogDiscovery({ initialChunk: 10_000 }).discover(W);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const addresses = outcome.collections.map((c) => c.contractAddress.toLowerCase());
    expect(addresses).toContain(COL_A.toLowerCase());
    expect(addresses).toContain(COL_B.toLowerCase());
    expect(addresses).not.toContain("0xdead");
    vi.unstubAllGlobals();
  });

  it("deduplicates repeated transfers of the same collection", async () => {
    stubRpc([head(1000), { result: [erc721Log(COL_A), erc721Log(COL_A), erc721Log(COL_A)] }]);

    const outcome = await new OnChainLogDiscovery({ initialChunk: 10_000 }).discover(W);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.collections).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("leaves names null so they are resolved on-chain later", async () => {
    stubRpc([head(1000), { result: [erc721Log(COL_A)] }]);
    const outcome = await new OnChainLogDiscovery({ initialChunk: 10_000 }).discover(W);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // The scan cannot know a name; the hybrid reads name() from the contract.
    expect(outcome.collections[0]!.name).toBeNull();
    vi.unstubAllGlobals();
  });

  it("halves the chunk on an oversized response rather than giving up", async () => {
    const fetchMock = vi.fn();
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        fetchMock();
        if (call === 1) return new Response(JSON.stringify(head(100_000)), { status: 200 });
        if (call === 2) {
          return new Response(
            JSON.stringify({ error: { message: "Log response size exceeded" } }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ result: [erc721Log(COL_A)] }), { status: 200 });
      }),
    );

    const outcome = await new OnChainLogDiscovery({
      initialChunk: 100_000,
      minChunk: 1_000,
      maxRequests: 30,
    }).discover(W);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.collections).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("reports rate limiting distinctly instead of shrinking further", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        if (call === 1) return new Response(JSON.stringify(head(100_000)), { status: 200 });
        // An HTML error page — what a throttled endpoint actually returns.
        return new Response("<!doctype html><html>429</html>", { status: 429 });
      }),
    );

    const outcome = await new OnChainLogDiscovery().discover(W);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("rate-limited");
    // Must not surface as a confusing JSON parse error.
    expect(outcome.error).not.toMatch(/Unexpected token/);
    expect(outcome.error).toMatch(/rate limited/i);
    vi.unstubAllGlobals();
  });

  it("returns partial collections when the request budget is exhausted", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        if (call === 1) return new Response(JSON.stringify(head(100_000_000)), { status: 200 });
        // Always dense, so the scan never reaches block 0 within budget.
        return new Response(
          JSON.stringify({ result: Array.from({ length: 600 }, () => erc721Log(COL_A)) }),
          { status: 200 },
        );
      }),
    );

    const outcome = await new OnChainLogDiscovery({
      maxRequests: 3,
      initialChunk: 1_000,
    }).discover(W);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // Incomplete, but what it found is real and must still be usable.
    expect(outcome.partialCollections).toHaveLength(1);
    expect(outcome.error).toMatch(/older history was not reached/);
    vi.unstubAllGlobals();
  });

  it("completes cleanly for a wallet with no NFT history", async () => {
    stubRpc([head(5_000), { result: [] }]);
    const outcome = await new OnChainLogDiscovery({ initialChunk: 1_000_000 }).discover(W);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.collections).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("times out rather than hanging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init?: { signal?: AbortSignal }) =>
          new Promise((_res, rej) => {
            init?.signal?.addEventListener("abort", () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              rej(e);
            });
          }),
      ),
    );

    const outcome = await new OnChainLogDiscovery({ timeoutMs: 40 }).discover(W);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/timed out/);
    vi.unstubAllGlobals();
  });

  it("needs no credential", () => {
    expect(new OnChainLogDiscovery().configured).toBe(true);
  });

  it("emits a reproduce command against the log-scan endpoint", () => {
    const cmd = new OnChainLogDiscovery().reproduceCommand(W);
    expect(cmd).toContain("eth_getLogs");
    expect(cmd).toContain("rpc1.monad.xyz");
    expect(cmd).toContain(W.slice(2).toLowerCase());
  });
});
