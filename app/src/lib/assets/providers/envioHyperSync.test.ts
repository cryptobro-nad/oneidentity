import { describe, expect, it } from "vitest";
import { EnvioHyperSyncProvider } from "./envioHyperSync";
import {
  erc1155BatchLog,
  erc1155SingleLog,
  erc20TransferLog,
  erc721TransferLog,
  fakeLogSource,
  ok,
} from "../__fixtures__/envioLogs";
import type { PortfolioAddress } from "@/lib/types";

// Distinct, valid Monad addresses. Lowercase is fine — the decoder checksums.
const W1 = "0x017f9358afcc7018dd683001fd33fd7d68230d8b" as PortfolioAddress;
const W2 = "0xe3a0795381521c177fc8c7723213df7b56a10a31" as PortfolioAddress;
const OTHER = "0x1139dec3a681c96807d8c277601655a707494aaa";
const USDC_A = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
const USDC_B = "0x00000000efe302beaa2b3e6e1b18d08d69a9012a"; // same "symbol" idea, different contract
const NFT721 = "0x6657d192273731c3cac646cc82d5f28d0cbe8ccc";
const NFT1155 = "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364";

const provider = (byWallet: Parameters<typeof fakeLogSource>[0], opts = {}) =>
  new EnvioHyperSyncProvider(fakeLogSource(byWallet, opts));

describe("EnvioHyperSyncProvider — ERC-20 discovery", () => {
  it("proposes an arbitrary ERC-20 contract from an incoming transfer", async () => {
    const p = provider({ [W1]: ok([erc20TransferLog(USDC_A, OTHER, W1, 5n)]) });
    const res = await p.discover([W1]);
    expect(res.fungibles).toHaveLength(1);
    expect(res.fungibles[0]!.contractAddress.toLowerCase()).toBe(USDC_A);
    expect(res.fungibles[0]!.standard).toBe("erc20");
    expect(res.status).toBe("complete");
  });

  it("keeps same-symbol tokens from different contracts separate", async () => {
    const p = provider({
      [W1]: ok([erc20TransferLog(USDC_A, OTHER, W1, 1n), erc20TransferLog(USDC_B, OTHER, W1, 1n)]),
    });
    const res = await p.discover([W1]);
    const contracts = res.fungibles.map((f) => f.contractAddress.toLowerCase()).sort();
    expect(contracts).toEqual([USDC_B, USDC_A].sort());
  });

  it("dedupes one contract seen many times, merging wallets", async () => {
    const p = provider({
      [W1]: ok([erc20TransferLog(USDC_A, OTHER, W1, 1n), erc20TransferLog(USDC_A, OTHER, W1, 2n)]),
      [W2]: ok([erc20TransferLog(USDC_A, OTHER, W2, 3n)]),
    });
    const res = await p.discover([W1, W2]);
    expect(res.fungibles).toHaveLength(1);
    expect(res.fungibles[0]!.wallets.map((w) => w.toLowerCase()).sort()).toEqual(
      [W1, W2].sort(),
    );
  });

  it("still proposes a token that was received, sent away, then reacquired", async () => {
    // Incoming captures both receipts; the later one is enough to keep it a candidate.
    const p = provider({
      [W1]: ok([erc20TransferLog(USDC_A, OTHER, W1, 10n), erc20TransferLog(USDC_A, OTHER, W1, 4n)]),
    });
    const res = await p.discover([W1]);
    expect(res.fungibles).toHaveLength(1);
  });

  it("never proposes native MON as an ERC-20 (it has no Transfer logs)", async () => {
    const p = provider({ [W1]: ok([erc20TransferLog(USDC_A, OTHER, W1, 1n)]) });
    const res = await p.discover([W1]);
    // Only the real ERC-20 contract; nothing standing in for native MON.
    expect(res.fungibles.every((f) => f.standard === "erc20")).toBe(true);
    expect(res.fungibles).toHaveLength(1);
  });
});

describe("EnvioHyperSyncProvider — NFTs", () => {
  it("classifies a 4-topic Transfer as ERC-721 and records the token id", async () => {
    const p = provider({ [W1]: ok([erc721TransferLog(NFT721, OTHER, W1, 42n)]) });
    const res = await p.discover([W1]);
    expect(res.fungibles).toHaveLength(0);
    expect(res.nfts).toHaveLength(1);
    expect(res.nfts[0]!.standard).toBe("erc721");
    expect(res.nfts[0]!.tokenIds).toContain("42");
  });

  it("discovers ERC-1155 from TransferSingle and TransferBatch, collecting ids", async () => {
    const p = provider({
      [W1]: ok([
        erc1155SingleLog(NFT1155, OTHER, OTHER, W1, 7n, 3n),
        erc1155BatchLog(NFT1155, OTHER, OTHER, W1, [8n, 9n], [1n, 2n]),
      ]),
    });
    const res = await p.discover([W1]);
    expect(res.nfts).toHaveLength(1);
    expect(res.nfts[0]!.standard).toBe("erc1155");
    expect(res.nfts[0]!.tokenIds.sort()).toEqual(["7", "8", "9"]);
  });

  it("dedupes the same collection across wallets", async () => {
    const p = provider({
      [W1]: ok([erc721TransferLog(NFT721, OTHER, W1, 1n)]),
      [W2]: ok([erc721TransferLog(NFT721, OTHER, W2, 2n)]),
    });
    const res = await p.discover([W1, W2]);
    expect(res.nfts).toHaveLength(1);
    expect(res.nfts[0]!.wallets.length).toBe(2);
    expect(res.nfts[0]!.tokenIds.sort()).toEqual(["1", "2"]);
  });
});

describe("EnvioHyperSyncProvider — robustness and honesty", () => {
  it("skips malformed rows without failing the whole discovery", async () => {
    const p = provider({
      [W1]: ok([
        { address: USDC_A, topics: [null], data: "0x" }, // no topic0
        { address: "not-an-address", topics: ["0xdead"], data: "0x" }, // bad address
        erc20TransferLog(USDC_A, OTHER, W1, 1n), // one good row
      ]),
    });
    const res = await p.discover([W1]);
    expect(res.fungibles).toHaveLength(1);
    expect(res.status).toBe("complete");
  });

  it("records a per-wallet failure but still discovers the others", async () => {
    const p = provider({
      [W1]: { reason: "timeout after 12000ms", blocked: false },
      [W2]: ok([erc20TransferLog(USDC_A, OTHER, W2, 1n)]),
    });
    const res = await p.discover([W1, W2]);
    expect(res.status).toBe("partial");
    expect(
      res.failures.some((f) => f.wallet?.toLowerCase() === W1 && f.reason.includes("timeout")),
    ).toBe(true);
    expect(res.fungibles).toHaveLength(1);
  });

  it("reports unavailable when every wallet is blocked", async () => {
    const p = provider({
      [W1]: { reason: "usage limit reached", blocked: true },
      [W2]: { reason: "usage limit reached", blocked: true },
    });
    const res = await p.discover([W1, W2]);
    expect(res.status).toBe("unavailable");
  });

  it("flags partial when a log source did not reach chain head", async () => {
    const p = provider({ [W1]: ok([erc20TransferLog(USDC_A, OTHER, W1, 1n)], { complete: false }) });
    const res = await p.discover([W1]);
    expect(res.status).toBe("partial");
  });

  it("caps candidates and flags the result partial rather than scanning unbounded", async () => {
    // 3 distinct ERC-20 contracts, cap of 2.
    const rows = [
      erc20TransferLog("0x1111111111111111111111111111111111111111", OTHER, W1, 1n),
      erc20TransferLog("0x2222222222222222222222222222222222222222", OTHER, W1, 1n),
      erc20TransferLog("0x3333333333333333333333333333333333333333", OTHER, W1, 1n),
    ];
    const p = new EnvioHyperSyncProvider(fakeLogSource({ [W1]: ok(rows) }), {
      maxFungibleCandidates: 2,
      maxNftCandidates: 200,
      maxTokenIdsPerCollection: 100,
    });
    const res = await p.discover([W1]);
    expect(res.fungibles).toHaveLength(2);
    expect(res.status).toBe("partial");
    expect(res.failures.some((f) => f.scope === "pagination")).toBe(true);
  });

  it("reflects the log source's configured state", async () => {
    const configured = new EnvioHyperSyncProvider(fakeLogSource({}, { configured: true }));
    const unconfigured = new EnvioHyperSyncProvider(fakeLogSource({}, { configured: false }));
    expect(configured.configured).toBe(true);
    expect(unconfigured.configured).toBe(false);
  });
});
