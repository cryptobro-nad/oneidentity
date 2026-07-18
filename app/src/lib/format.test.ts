import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatBlockNumber,
  formatCount,
  formatTimestamp,
  pluralise,
  shortenAddress,
  walletLabel,
} from "./format";

describe("formatAmount", () => {
  it("formats whole MON from wei", () => {
    expect(formatAmount(1_000_000_000_000_000_000n, 18)).toBe("1");
  });

  it("formats a fractional MON amount", () => {
    expect(formatAmount(1_500_000_000_000_000_000n, 18)).toBe("1.5");
  });

  it("formats 6-decimal stablecoins", () => {
    expect(formatAmount(10_025_337_220n, 6)).toBe("10,025.3372");
    expect(formatAmount(228_109_172n, 6)).toBe("228.1091");
    expect(formatAmount(646_810_575n, 6)).toBe("646.8105");
  });

  it("renders a genuine zero as 0", () => {
    expect(formatAmount(0n, 6)).toBe("0");
    expect(formatAmount(0n, 18)).toBe("0");
  });

  it("groups thousands", () => {
    expect(formatAmount(1_629_382_684_819_370_271_507_052n, 18)).toBe("1,629,382.6848");
  });

  it("truncates rather than rounds, so a balance is never overstated", () => {
    // 1.99999 truncated at 4dp is 1.9999, not 2.0
    expect(formatAmount(1_999_990n, 6)).toBe("1.9999");
  });

  it("never shows a non-zero dust balance as plain 0", () => {
    // 1 wei is far below 4dp but the wallet is not empty.
    expect(formatAmount(1n, 18)).toBe("< 0.0001");
  });

  it("respects a custom fraction-digit limit", () => {
    expect(formatAmount(1_234_567n, 6, 2)).toBe("1.23");
    expect(formatAmount(1_234_567n, 6, 0)).toBe("1");
  });

  it("trims trailing zeros", () => {
    expect(formatAmount(1_500_000n, 6)).toBe("1.5");
    expect(formatAmount(1_000_000n, 6)).toBe("1");
  });
});

describe("shortenAddress", () => {
  it("shortens a full address", () => {
    expect(shortenAddress("0xB09684f5486d1af80699BbC27f14dd5A905da873")).toBe("0xB096…a873");
  });

  it("leaves short strings untouched", () => {
    expect(shortenAddress("0x1234")).toBe("0x1234");
  });
});

describe("walletLabel", () => {
  it("labels wallets A through E", () => {
    expect([0, 1, 2, 3, 4].map(walletLabel)).toEqual([
      "Wallet A",
      "Wallet B",
      "Wallet C",
      "Wallet D",
      "Wallet E",
    ]);
  });
});

describe("misc formatters", () => {
  it("formats block numbers with separators", () => {
    expect(formatBlockNumber(88_613_299n)).toBe("88,613,299");
  });

  it("formats counts", () => {
    expect(formatCount(7n)).toBe("7");
    expect(formatCount(1234n)).toBe("1,234");
  });

  it("formats timestamps as fixed UTC", () => {
    expect(formatTimestamp(Date.UTC(2026, 6, 18, 18, 21, 26))).toBe("2026-07-18 18:21:26 UTC");
  });

  it("pluralises", () => {
    expect(pluralise(1n, "NFT")).toBe("NFT");
    expect(pluralise(0n, "NFT")).toBe("NFTs");
    expect(pluralise(7n, "NFT")).toBe("NFTs");
  });
});
