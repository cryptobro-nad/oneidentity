import { describe, expect, it } from "vitest";
import {
  bucketFor,
  groupFungibles,
  usedCuratedFallback,
  type WireFungibleHolding,
} from "./display";
import type { PartialFailure } from "./types";

const W1 = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B";
const W2 = "0xe3A0795381521C177fc8c7723213df7B56A10a31";
const C_REC = "0x1111111111111111111111111111111111111111";
const C_OTHER = "0x2222222222222222222222222222222222222222";
const C_SPAM = "0x3333333333333333333333333333333333333333";

const holding = (o: Partial<WireFungibleHolding> & { wallet: string; contractAddress: string; raw: string }): WireFungibleHolding => ({
  chainId: 143,
  standard: "erc20",
  decimals: 18,
  symbol: "TKN",
  name: "Token",
  metadataQuality: "onchain",
  classification: "other",
  verification: "unknown",
  discoverySource: "envio",
  incomplete: false,
  ...o,
});

describe("bucketFor", () => {
  it("routes curated-allowlist tokens to recognized, even with a lure-like name", () => {
    expect(bucketFor("recognized", "claim rewards at scam.xyz", "USDC")).toBe("recognized");
  });
  it("routes an unknown token with a lure name to spam", () => {
    expect(bucketFor("other", "Visit claim-airdrop.xyz", "AIR")).toBe("spam");
  });
  it("routes a plain unknown token to other, never spam for being unknown", () => {
    expect(bucketFor("other", "Some Token", "SOME")).toBe("other");
  });
  it("treats a missing name as not-spam", () => {
    expect(bucketFor("other", null, null)).toBe("other");
  });
});

describe("groupFungibles", () => {
  const wallets = [W1, W2];

  it("pivots per contract, sums the total, and fills a muted zero for a non-holding wallet", () => {
    const { recognized } = groupFungibles(
      [holding({ wallet: W1, contractAddress: C_REC, raw: "5", classification: "recognized", symbol: "USDC", name: "USD Coin" })],
      [],
      wallets,
    );
    expect(recognized).toHaveLength(1);
    const row = recognized[0]!;
    expect(row.total).toBe(5n);
    // W1 holds 5; W2 has no holding and no failure → a genuine zero.
    expect(row.cells[0]).toMatchObject({ raw: 5n, failed: false });
    expect(row.cells[1]).toMatchObject({ raw: 0n, failed: false });
  });

  it("keeps same-symbol different-contract tokens as separate rows", () => {
    const { other } = groupFungibles(
      [
        holding({ wallet: W1, contractAddress: C_OTHER, raw: "1", symbol: "USDC" }),
        holding({ wallet: W1, contractAddress: C_SPAM, raw: "2", symbol: "USDC", name: "USD Coin" }),
      ],
      [],
      wallets,
    );
    expect(other).toHaveLength(2);
    expect(new Set(other.map((r) => r.contractAddress.toLowerCase())).size).toBe(2);
  });

  it("preserves a failed read as a failed cell, never a zero", () => {
    const failures: PartialFailure[] = [
      { scope: "contract", wallet: W2, contract: C_OTHER, reason: "execution reverted", blocked: false },
    ];
    const { other } = groupFungibles(
      [holding({ wallet: W1, contractAddress: C_OTHER, raw: "9" })],
      failures,
      wallets,
    );
    const row = other[0]!;
    expect(row.cells[0]).toMatchObject({ raw: 9n, failed: false });
    expect(row.cells[1]).toMatchObject({ raw: null, failed: true });
    expect(row.cells[1]!.error).toMatch(/reverted/);
    expect(row.total).toBe(9n); // failed wallet excluded from the total
  });

  it("shows a contract that only ever failed to read (never hidden as zero)", () => {
    const failures: PartialFailure[] = [
      { scope: "contract", wallet: W1, contract: C_OTHER, reason: "no result", blocked: false },
    ];
    const { other } = groupFungibles([], failures, [W1]);
    expect(other).toHaveLength(1);
    expect(other[0]!.cells[0]!.failed).toBe(true);
    expect(other[0]!.total).toBe(0n);
  });

  it("sorts each bucket by combined total, largest first", () => {
    const { other } = groupFungibles(
      [
        holding({ wallet: W1, contractAddress: C_OTHER, raw: "1", symbol: "A" }),
        holding({ wallet: W1, contractAddress: C_SPAM, raw: "9", symbol: "B", name: "B" }),
      ],
      [],
      [W1],
    );
    expect(other.map((r) => r.total)).toEqual([9n, 1n]);
  });

  it("routes a lure-named unknown token to the spam bucket", () => {
    const { spam, other } = groupFungibles(
      [holding({ wallet: W1, contractAddress: C_SPAM, raw: "1", name: "Claim at reward.xyz", symbol: "RWD" })],
      [],
      [W1],
    );
    expect(spam).toHaveLength(1);
    expect(other).toHaveLength(0);
  });
});

describe("usedCuratedFallback", () => {
  it("is true only when Envio was attempted and fell back", () => {
    expect(
      usedCuratedFallback("curated", [
        { scope: "provider", reason: 'Discovery provider "envio" unavailable; using curated fallback.', blocked: false },
      ]),
    ).toBe(true);
  });
  it("is false for a plain curated deployment (never attempted dynamic)", () => {
    expect(usedCuratedFallback("curated", [])).toBe(false);
  });
  it("is false when the dynamic provider actually served the result", () => {
    expect(usedCuratedFallback("envio", [])).toBe(false);
  });
});
