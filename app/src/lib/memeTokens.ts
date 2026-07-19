/**
 * Curated Monad community ("meme") token list.
 *
 * Every address below was verified before inclusion. Symbols are NOT a safe
 * identifier on their own: while researching this list I found six different
 * live contracts answering `symbol() = "MOLANDAK"` and five answering
 * "moncock"/"mCOCK". Picking by symbol would have shipped an imitation token.
 *
 * INCLUSION CRITERIA — a token ships only if all four hold:
 *
 *   1. nad.fun's own API (`GET https://api.nad.fun/token/:address`) returns it
 *      with `is_graduated: true`. nad.fun is the launchpad that minted these;
 *      graduation means the bonding curve completed and the token moved to a
 *      DEX. Non-graduated copycats fail here.
 *   2. It is the ONLY graduated token for that symbol in the nad.fun index
 *      (1,200 tokens scanned via `GET /order/market_cap`).
 *   3. An official project website and/or X account exists and is recorded.
 *   4. Direct onchain reads on Monad Mainnet agree: bytecode present,
 *      `name()`, `symbol()`, `decimals()`, `totalSupply()` and `balanceOf()`
 *      all answer, and symbol/decimals match this file.
 *
 * Seven of the nine are EIP-1167 minimal proxies cloning implementation
 * 0x7f64ccfeb3e3afd7691ea0ef404e947786cefae8; JAMES clones the newer
 * 0x4f44eafa383fe5f97a0d6cff97fc5d605d026fbd (nad.fun V2). The `…7777` suffix
 * is a CREATE2 vanity salt mined by the launchpad, not a coincidence.
 *
 * `symbol` is the ONCHAIN symbol, verbatim and case-sensitive — several are
 * lowercase. `displayName` is what the UI shows. Do not "tidy" the symbols:
 * they key the totals map and are asserted against chain reads in tests.
 *
 * Full evidence, including the excluded tokens, is in
 * docs/meme-token-verification.md.
 *
 * Inclusion here is NOT an endorsement. These are volatile community tokens.
 * ONE reads balances only; it never prices, ranks or recommends them.
 */

import { MONAD_CHAIN_ID } from "./chain";

export type MemeToken = {
  chainId: typeof MONAD_CHAIN_ID;
  /** Checksummed Monad Mainnet address. */
  address: `0x${string}`;
  /** Onchain `symbol()`, verbatim. Keys the totals map. */
  symbol: string;
  /** Human-facing label. */
  displayName: string;
  decimals: number;
  explorerUrl: string;
  /** Official site or social used as identity evidence. */
  source: string;
};

const explorer = (address: string) => `https://monadscan.com/token/${address}`;

export const CURATED_MEME_TOKENS: readonly MemeToken[] = [
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777",
    symbol: "CHOG",
    displayName: "Chog",
    decimals: 18,
    explorerUrl: explorer("0x350035555E10d9AfAF1566AaebfCeD5BA6C27777"),
    source: "https://chog.xyz/",
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x43cF5407BDA1400498b8064d50A7e17528d87777",
    symbol: "JAMES",
    displayName: "James",
    decimals: 18,
    explorerUrl: explorer("0x43cF5407BDA1400498b8064d50A7e17528d87777"),
    source: "https://www.busybullmon.com/",
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x21E325B059Cd83d4037C82F0F5998Ba2dF3d7777",
    symbol: "BOB",
    displayName: "Bob",
    decimals: 18,
    explorerUrl: explorer("0x21E325B059Cd83d4037C82F0F5998Ba2dF3d7777"),
    source: "https://bobmonad.com",
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x42a4aA89864A794dE135B23C6a8D2E05513d7777",
    symbol: "shramp",
    displayName: "Shramp",
    decimals: 18,
    explorerUrl: explorer("0x42a4aA89864A794dE135B23C6a8D2E05513d7777"),
    source: "https://shramp.me/",
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x3842751a46D23B41A47E702473dFf316E6237777",
    symbol: "143",
    displayName: "143",
    decimals: 18,
    explorerUrl: explorer("0x3842751a46D23B41A47E702473dFf316E6237777"),
    source: "https://143.community/",
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x81A224F8A62f52BdE942dBF23A56df77A10b7777",
    symbol: "emo",
    displayName: "emonad",
    decimals: 18,
    explorerUrl: explorer("0x81A224F8A62f52BdE942dBF23A56df77A10b7777"),
    source: "https://emonad.lol",
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x3Ec7310937281CA4Bf89D5bB11704bE9b7ff7777",
    symbol: "ANAGO",
    displayName: "Anago",
    decimals: 18,
    explorerUrl: explorer("0x3Ec7310937281CA4Bf89D5bB11704bE9b7ff7777"),
    source: "https://anagocult.com/",
  },
  {
    // Onchain symbol is "EGG"; the project and token name are "EGGMON".
    chainId: MONAD_CHAIN_ID,
    address: "0xD10cf12099f5Fb424Bc77401DF49f0c785657777",
    symbol: "EGG",
    displayName: "EGGMON",
    decimals: 18,
    explorerUrl: explorer("0xD10cf12099f5Fb424Bc77401DF49f0c785657777"),
    source: "https://eggmon.fun",
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x405b6330e213DED490240CbcDD64790806827777",
    symbol: "moncock",
    displayName: "moncock",
    decimals: 18,
    explorerUrl: explorer("0x405b6330e213DED490240CbcDD64790806827777"),
    source: "https://moncock.wtf/",
  },
] as const;

/**
 * Requested but deliberately NOT shipped.
 *
 * Recorded rather than deleted so the decision is auditable and so nobody
 * re-researches them from scratch. See docs/meme-token-verification.md.
 */
export const EXCLUDED_MEME_TOKENS: readonly {
  requestedSymbol: string;
  reason: string;
  addresses: string[];
}[] = [
  {
    requestedSymbol: "MONIGGA",
    // Verifies on every technical criterion — graduated, unique, official site,
    // clean onchain metadata. Excluded purely because its name embeds a racial
    // slur and this is a public, shareable product. Not a verification failure.
    reason: "excluded-by-policy: name embeds a racial slur",
    addresses: ["0x73b62FF5CFea3Fb857DBE84a57f1631630247777"],
  },
  {
    requestedSymbol: "MOLANDAK",
    // Two live tokens share this symbol and reputable sources disagree:
    //   0x7B27…7777 — nad.fun graduated, is_cto, named by molandakcto.xyz
    //   0xd32e…d42d — listed by CoinGecko, OpenSea and DexScreener; unknown to
    //                 nad.fun (Lens reverts exactly as for a dead address)
    // Picking wrong renders a confident "0" to a real holder of the other, so
    // neither ships until the canonical one is confirmed.
    reason: "unresolved: two live tokens share this symbol; sources conflict",
    addresses: [
      "0x7B2728c04aD436153285702e969e6EfAc3a97777",
      "0xd32e9ddd968b18e8429f2d1da7efb2cc1f01d42d",
    ],
  },
];

/** Symbols whose zero balance is still worth showing. Only the native asset. */
export const ALWAYS_SHOWN_SYMBOLS = ["MON"] as const;
