import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { verifyFungibles } from "./verify";
import { SUPPORTED_STABLECOINS } from "@/lib/tokens";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import type { FungibleCandidate } from "./types";
import type { PortfolioAddress } from "@/lib/types";

const W1 = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;
const RECOGNIZED = SUPPORTED_STABLECOINS[0]!.address; // USDC — on the curated allowlist
const OTHER = "0x1111111111111111111111111111111111111111" as PortfolioAddress; // arbitrary

type Entry = { status: "success"; result: unknown } | { status: "failure"; error: unknown };
const okv = (r: unknown): Entry => ({ status: "success", result: r });
const failv = (): Entry => ({ status: "failure", error: new Error("execution reverted") });

const candidate = (address: PortfolioAddress): FungibleCandidate => ({
  chainId: MONAD_CHAIN_ID,
  contractAddress: address,
  standard: "erc20",
  wallets: [W1],
  source: "envio",
});

/** Fake client: first multicall is balanceOf, second is decimals/symbol/name. */
function client(balances: Entry[], meta: Entry[], block = 100n): PublicClient {
  return {
    getBlockNumber: async () => block,
    multicall: async (args: { contracts: { functionName: string }[] }) =>
      args.contracts[0]?.functionName === "balanceOf" ? balances : meta,
  } as unknown as PublicClient;
}

describe("verifyFungibles", () => {
  it("keeps a non-zero holding, drops a successful zero, reads metadata on-chain", async () => {
    const res = await verifyFungibles(
      client(
        [okv(5n), okv(0n)], // RECOGNIZED = 5, OTHER = 0 (dropped)
        [okv(6), okv("USDC"), okv("USD Coin"), okv(18), okv("OTH"), okv("Other")],
      ),
      [candidate(RECOGNIZED), candidate(OTHER)],
      [W1],
    );
    expect(res.holdings).toHaveLength(1);
    const h = res.holdings[0]!;
    expect(h.contractAddress).toBe(RECOGNIZED);
    expect(h.raw).toBe(5n);
    expect(h.decimals).toBe(6);
    expect(h.symbol).toBe("USDC");
    expect(h.classification).toBe("recognized");
    expect(h.verification).toBe("curated-allowlist");
    expect(res.partial).toBe(false);
  });

  it("shows an unknown non-zero token as 'other', never hidden", async () => {
    const res = await verifyFungibles(
      client(
        [okv(5n), okv(7n)],
        [okv(6), okv("USDC"), okv("USD Coin"), okv(18), okv("OTH"), okv("Other")],
      ),
      [candidate(RECOGNIZED), candidate(OTHER)],
      [W1],
    );
    expect(res.holdings).toHaveLength(2);
    const other = res.holdings.find((h) => h.contractAddress === OTHER)!;
    expect(other.classification).toBe("other");
    expect(other.verification).toBe("unknown");
    expect(other.raw).toBe(7n);
  });

  it("reports a failed balance read as a failure, never as a zero holding", async () => {
    const res = await verifyFungibles(
      client(
        [okv(5n), failv()], // OTHER balance read failed
        [okv(6), okv("USDC"), okv("USD Coin"), okv(18), okv("OTH"), okv("Other")],
      ),
      [candidate(RECOGNIZED), candidate(OTHER)],
      [W1],
    );
    expect(res.holdings.some((h) => h.contractAddress === OTHER)).toBe(false);
    expect(res.failures.some((f) => f.contract === OTHER && f.scope === "contract")).toBe(true);
    expect(res.partial).toBe(true);
  });

  it("keeps the balance but flags incomplete when metadata reads fail", async () => {
    const res = await verifyFungibles(
      client([okv(5n)], [failv(), failv(), failv()]),
      [candidate(RECOGNIZED)],
      [W1],
    );
    expect(res.holdings).toHaveLength(1);
    const h = res.holdings[0]!;
    expect(h.raw).toBe(5n);
    expect(h.decimals).toBe(18); // safe fallback
    expect(h.symbol).toBeNull();
    expect(h.incomplete).toBe(true);
    expect(h.metadataQuality).toBe("missing");
    expect(res.partial).toBe(true);
  });

  it("only ever produces erc20 holdings (native is never a candidate here)", async () => {
    const res = await verifyFungibles(
      client([okv(1n)], [okv(18), okv("X"), okv("X token")]),
      [candidate(OTHER)],
      [W1],
    );
    expect(res.holdings.every((h) => h.standard === "erc20")).toBe(true);
  });
});
