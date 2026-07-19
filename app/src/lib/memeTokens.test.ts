import { describe, expect, it } from "vitest";
import { getAddress, isAddress } from "viem";
import { CURATED_MEME_TOKENS, EXCLUDED_MEME_TOKENS } from "./memeTokens";
import {
  ALL_BALANCE_TOKENS,
  SUPPORTED_STABLECOINS,
  isMemeSymbol,
  decimalsForSymbol,
} from "./tokens";
import { MONAD_CHAIN_ID } from "./chain";

/**
 * Reviewed fixtures.
 *
 * Deliberately duplicated from the config rather than imported from it: a test
 * that reads the same constant it asserts proves nothing. These values come
 * from the verification pass recorded in docs/meme-token-verification.md, so a
 * typo'd edit to the config fails here.
 */
const REVIEWED: Record<string, { address: string; decimals: number }> = {
  CHOG: { address: "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777", decimals: 18 },
  JAMES: {
    address: "0x43cF5407BDA1400498b8064d50A7e17528d87777",
    decimals: 18,
  },
  BOB: { address: "0x21E325B059Cd83d4037C82F0F5998Ba2dF3d7777", decimals: 18 },
  shramp: {
    address: "0x42a4aA89864A794dE135B23C6a8D2E05513d7777",
    decimals: 18,
  },
  "143": {
    address: "0x3842751a46D23B41A47E702473dFf316E6237777",
    decimals: 18,
  },
  emo: { address: "0x81A224F8A62f52BdE942dBF23A56df77A10b7777", decimals: 18 },
  ANAGO: {
    address: "0x3Ec7310937281CA4Bf89D5bB11704bE9b7ff7777",
    decimals: 18,
  },
  EGG: { address: "0xD10cf12099f5Fb424Bc77401DF49f0c785657777", decimals: 18 },
  moncock: {
    address: "0x405b6330e213DED490240CbcDD64790806827777",
    decimals: 18,
  },
};

describe("addresses", () => {
  it("are all valid", () => {
    for (const t of CURATED_MEME_TOKENS) {
      expect(isAddress(t.address), `${t.symbol} is not a valid address`).toBe(true);
    }
  });

  it("are all EIP-55 checksummed", () => {
    // A lowercase address still "works", but a checksummed one is the only
    // form that catches a transposed character on review.
    for (const t of CURATED_MEME_TOKENS) {
      expect(t.address, `${t.symbol} is not checksummed`).toBe(getAddress(t.address));
    }
  });

  it("are unique", () => {
    const seen = CURATED_MEME_TOKENS.map((t) => t.address.toLowerCase());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("match the reviewed fixtures exactly", () => {
    for (const t of CURATED_MEME_TOKENS) {
      expect(REVIEWED[t.symbol], `${t.symbol} is not in the reviewed set`).toBeDefined();
      expect(t.address).toBe(REVIEWED[t.symbol]!.address);
    }
  });

  it("never collide with a stablecoin address", () => {
    const stable = SUPPORTED_STABLECOINS.map((t) => t.address.toLowerCase());
    for (const t of CURATED_MEME_TOKENS) {
      expect(stable).not.toContain(t.address.toLowerCase());
    }
  });
});

describe("symbols", () => {
  it("are unique, case-insensitively", () => {
    const seen = CURATED_MEME_TOKENS.map((t) => t.symbol.toLowerCase());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("never collide with MON or a stablecoin", () => {
    const reserved = ["mon", ...SUPPORTED_STABLECOINS.map((t) => t.symbol.toLowerCase())];
    for (const t of CURATED_MEME_TOKENS) {
      expect(reserved).not.toContain(t.symbol.toLowerCase());
    }
  });

  it("preserve the chain's own casing", () => {
    // shramp, emo and moncock are lowercase onchain. "Tidying" them would key
    // the totals map on a symbol the chain never returns.
    const bySymbol = new Map(CURATED_MEME_TOKENS.map((t) => [t.symbol, t]));
    expect(bySymbol.has("shramp")).toBe(true);
    expect(bySymbol.has("emo")).toBe(true);
    expect(bySymbol.has("moncock")).toBe(true);
    expect(bySymbol.has("SHRAMP")).toBe(false);
  });

  it("uses the onchain symbol EGG for the token displayed as EGGMON", () => {
    const egg = CURATED_MEME_TOKENS.find((t) => t.displayName === "EGGMON");
    expect(egg?.symbol).toBe("EGG");
  });
});

describe("decimals", () => {
  it("match the reviewed fixtures", () => {
    for (const t of CURATED_MEME_TOKENS) {
      expect(t.decimals).toBe(REVIEWED[t.symbol]!.decimals);
    }
  });

  it("are resolvable by symbol alongside MON and stablecoins", () => {
    expect(decimalsForSymbol("MON")).toBe(18);
    expect(decimalsForSymbol("USDC")).toBe(6);
    expect(decimalsForSymbol("CHOG")).toBe(18);
  });
});

describe("metadata", () => {
  it("pins every token to Monad Mainnet", () => {
    for (const t of CURATED_MEME_TOKENS) expect(t.chainId).toBe(MONAD_CHAIN_ID);
  });

  it("records an explorer URL containing the token's own address", () => {
    for (const t of CURATED_MEME_TOKENS) {
      expect(t.explorerUrl).toContain(t.address);
    }
  });

  it("records an identity source for every token", () => {
    for (const t of CURATED_MEME_TOKENS) {
      expect(t.source, `${t.symbol} has no source`).toMatch(/^https:\/\//);
    }
  });

  it("gives every token a display name", () => {
    for (const t of CURATED_MEME_TOKENS) expect(t.displayName.length).toBeGreaterThan(0);
  });
});

describe("unverified tokens are excluded, not guessed", () => {
  it("ships exactly the nine tokens that passed verification", () => {
    expect(CURATED_MEME_TOKENS).toHaveLength(9);
  });

  it("does not ship any requested-but-unresolved token", () => {
    const shipped = CURATED_MEME_TOKENS.map((t) => t.symbol.toLowerCase());
    for (const excluded of ["monigga", "molandak"]) {
      expect(shipped).not.toContain(excluded);
    }
  });

  it("does not ship any excluded address, under any symbol", () => {
    const shippedAddresses = CURATED_MEME_TOKENS.map((t) => t.address.toLowerCase());
    for (const entry of EXCLUDED_MEME_TOKENS) {
      for (const address of entry.addresses) {
        expect(shippedAddresses).not.toContain(address.toLowerCase());
      }
    }
  });

  it("records why each exclusion happened", () => {
    expect(EXCLUDED_MEME_TOKENS.length).toBeGreaterThan(0);
    for (const entry of EXCLUDED_MEME_TOKENS) {
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.addresses.length).toBeGreaterThan(0);
    }
  });

  it("keeps the contested MOLANDAK addresses on record rather than picking one", () => {
    const molandak = EXCLUDED_MEME_TOKENS.find((e) => e.requestedSymbol === "MOLANDAK");
    expect(molandak).toBeDefined();
    // Both candidates recorded, so the conflict is auditable.
    expect(molandak!.addresses).toHaveLength(2);
    expect(molandak!.reason).toMatch(/unresolved|conflict/i);
  });
});

describe("the combined balance list", () => {
  it("contains every stablecoin and every meme token, with no duplicates", () => {
    expect(ALL_BALANCE_TOKENS).toHaveLength(
      SUPPORTED_STABLECOINS.length + CURATED_MEME_TOKENS.length,
    );
    const symbols = ALL_BALANCE_TOKENS.map((t) => t.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("puts stablecoins before community tokens", () => {
    const firstMeme = ALL_BALANCE_TOKENS.findIndex((t) => isMemeSymbol(t.symbol));
    const lastStable = ALL_BALANCE_TOKENS.map((t) => isMemeSymbol(t.symbol)).lastIndexOf(false);
    expect(lastStable).toBeLessThan(firstMeme);
  });

  it("classifies symbols correctly", () => {
    expect(isMemeSymbol("CHOG")).toBe(true);
    expect(isMemeSymbol("USDC")).toBe(false);
    expect(isMemeSymbol("MON")).toBe(false);
  });
});

describe("no price or market data", () => {
  it("carries no price, market-cap or ranking field", () => {
    const serialised = JSON.stringify(CURATED_MEME_TOKENS).toLowerCase();
    for (const banned of ["price", "usd", "marketcap", "market_cap", "rank", "volume", "chart"]) {
      expect(serialised).not.toContain(banned);
    }
  });

  it("references no external price API", () => {
    const serialised = JSON.stringify(CURATED_MEME_TOKENS).toLowerCase();
    for (const host of ["dexscreener", "coingecko", "coinmarketcap", "birdeye"]) {
      expect(serialised).not.toContain(host);
    }
  });
});
