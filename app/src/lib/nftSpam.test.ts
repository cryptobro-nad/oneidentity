import { describe, expect, it } from "vitest";
import { isLikelyNftSpam } from "./nftSpam";

describe("isLikelyNftSpam", () => {
  it("flags collections whose name is a lure", () => {
    expect(isLikelyNftSpam("EVMHUB VOUCHER")).toBe(true);
    expect(isLikelyNftSpam("Claim your reward")).toBe(true);
    expect(isLikelyNftSpam("Free Airdrop")).toBe(true);
    expect(isLikelyNftSpam("Bonus drop")).toBe(true);
    expect(isLikelyNftSpam("Connect wallet to redeem")).toBe(true);
    expect(isLikelyNftSpam("visit claimnft.xyz")).toBe(true);
    expect(isLikelyNftSpam("t.me/somedrop")).toBe(true);
  });

  it("does NOT flag ordinary or unknown collections", () => {
    expect(isLikelyNftSpam("Clober Orderbook Maker Order")).toBe(false);
    expect(isLikelyNftSpam("Skrumpets")).toBe(false);
    expect(isLikelyNftSpam("EVMFI")).toBe(false); // suspicious-looking but no lure word
  });

  it("never flags missing or empty metadata alone", () => {
    expect(isLikelyNftSpam(null)).toBe(false);
    expect(isLikelyNftSpam(undefined)).toBe(false);
    expect(isLikelyNftSpam("")).toBe(false);
    expect(isLikelyNftSpam("   ")).toBe(false);
  });
});
