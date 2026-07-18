import { describe, expect, it } from "vitest";
import {
  decodeNftCheck,
  decodePortfolio,
  encodeNftCheck,
  encodePortfolio,
} from "./wire";
import type { AggregatedPortfolio, NftCollectionCheck, PortfolioAddress } from "./types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

const portfolio: AggregatedPortfolio = {
  wallets: [
    {
      address: A,
      mon: { success: true, rawValue: 1_629_382_684_819_370_271_507_052n },
      stablecoins: {
        USDC: { success: true, rawValue: 10_025_337_220n },
        USDT0: { success: false, error: "execution reverted" },
      },
    },
    {
      address: B,
      mon: { success: true, rawValue: 0n },
      stablecoins: { USDC: { success: true, rawValue: 0n } },
    },
  ],
  totals: { MON: 1_629_382_684_819_370_271_507_052n, USDC: 10_025_337_220n, USDT0: 0n },
  blockNumber: 88_613_299n,
  partial: true,
  endpointUsed: "https://rpc.monad.xyz",
  failedEndpoints: [],
  fetchedAt: 1_752_000_000_000,
};

describe("portfolio wire encoding", () => {
  it("round-trips without losing bigint precision", () => {
    const decoded = decodePortfolio(encodePortfolio(portfolio));
    expect(decoded).toEqual(portfolio);
  });

  it("preserves a very large MON value exactly", () => {
    const decoded = decodePortfolio(encodePortfolio(portfolio));
    expect(decoded.totals.MON).toBe(1_629_382_684_819_370_271_507_052n);
  });

  it("keeps failed reads distinguishable from zero after a round trip", () => {
    const decoded = decodePortfolio(encodePortfolio(portfolio));
    expect(decoded.wallets[0]?.stablecoins.USDT0).toEqual({
      success: false,
      error: "execution reverted",
    });
    expect(decoded.wallets[1]?.stablecoins.USDC).toEqual({ success: true, rawValue: 0n });
  });

  it("is JSON-serialisable once encoded", () => {
    expect(() => JSON.stringify(encodePortfolio(portfolio))).not.toThrow();
  });
});

describe("nft check wire encoding", () => {
  it("round-trips an ok result", () => {
    const check: NftCollectionCheck = {
      status: "ok",
      address: "0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC" as PortfolioAddress,
      wallets: [
        { address: A, result: { success: true, rawValue: 3n } },
        { address: B, result: { success: false, error: "reverted" } },
      ],
      total: 3n,
      partial: true,
      blockNumber: 88_613_299n,
      endpointUsed: "https://rpc.monad.xyz",
      checkedAt: 1_752_000_000_000,
    };
    expect(decodeNftCheck(encodeNftCheck(check))).toEqual(check);
  });

  it("round-trips the non-contract and non-erc721 verdicts", () => {
    const notContract: NftCollectionCheck = { status: "not-a-contract", address: A };
    const notErc721: NftCollectionCheck = { status: "not-erc721", address: A };
    expect(decodeNftCheck(encodeNftCheck(notContract))).toEqual(notContract);
    expect(decodeNftCheck(encodeNftCheck(notErc721))).toEqual(notErc721);
  });
});
