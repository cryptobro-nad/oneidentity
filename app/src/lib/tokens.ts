/**
 * Curated stablecoin list for the ONE prototype.
 *
 * Sourced from the official Monad token list (monad-crypto/token-list,
 * v2.45.1) and independently re-verified on-chain by the mainnet data spike:
 * each contract has code, answers name/symbol/decimals/totalSupply/balanceOf,
 * and matches the metadata below.
 *
 * mUSD is deliberately EXCLUDED from the initial configuration.
 */

import { MONAD_CHAIN_ID } from "./chain";
import { CURATED_MEME_TOKENS } from "./memeTokens";
import { MONAD_LIST_TOKENS } from "./monadTokenList";

export type SupportedStablecoin = {
  chainId: typeof MONAD_CHAIN_ID;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
};

/**
 * The minimum a token needs for a balance read.
 *
 * Stablecoins and curated meme tokens carry different metadata but are read
 * identically — one Multicall3 batch at one pinned block — so the loader works
 * against this narrow shape rather than either concrete type.
 */
export type BalanceToken = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  /** Optional display metadata (present for token-list entries). */
  name?: string;
  logoURI?: string;
};

export const SUPPORTED_STABLECOINS: readonly SupportedStablecoin[] = [
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0xe7cd86e13AC4309349F30B3435a9d337750fC82D",
    name: "USDT0",
    symbol: "USDT0",
    decimals: 6,
  },
  {
    chainId: MONAD_CHAIN_ID,
    address: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
    name: "AUSD",
    symbol: "AUSD",
    decimals: 6,
  },
] as const;

/** Symbol used for the native asset in totals maps. */
export const NATIVE_SYMBOL = "MON" as const;
export const NATIVE_DECIMALS = 18 as const;

/**
 * De-duplicates a token list by CONTRACT ADDRESS (the stable identity), keeping
 * the first occurrence. This is why the same address appearing in both the
 * curated stablecoins and the broad Monad list collapses to one row, and why
 * two contracts that happen to share a symbol are always kept separate.
 */
function dedupeByAddress(tokens: readonly BalanceToken[]): BalanceToken[] {
  const byAddress = new Map<string, BalanceToken>();
  const order: string[] = [];
  for (const t of tokens) {
    const key = t.address.toLowerCase();
    const existing = byAddress.get(key);
    if (!existing) {
      byAddress.set(key, { ...t });
      order.push(key);
    } else {
      // Same contract from a later source (e.g. the token list): keep the first
      // entry's position/decimals but backfill any missing name or logo.
      if (!existing.name && t.name) existing.name = t.name;
      if (!existing.logoURI && t.logoURI) existing.logoURI = t.logoURI;
    }
  }
  return order.map((k) => byAddress.get(k)!);
}

/**
 * Every ERC-20 read on an explicit portfolio load, in display order: curated
 * stablecoins first, then the broad Monad Mainnet token-list majors, then the
 * curated community tokens. Keyed by contract address (deduped), so the same
 * contract is never read twice and same-symbol/different-contract entries stay
 * separate.
 *
 * One list means one multicall and one pinned block, so a single wallet gets
 * exactly the same coverage as five. Non-zero filtering happens at display time.
 */
export const ALL_BALANCE_TOKENS: readonly BalanceToken[] = dedupeByAddress([
  ...SUPPORTED_STABLECOINS,
  ...MONAD_LIST_TOKENS,
  ...CURATED_MEME_TOKENS,
]);

const MEME_SYMBOLS: ReadonlySet<string> = new Set(CURATED_MEME_TOKENS.map((t) => t.symbol));

/** True when the symbol is a curated community token rather than MON/stablecoin. */
export function isMemeSymbol(symbol: string): boolean {
  return MEME_SYMBOLS.has(symbol);
}

export function decimalsForSymbol(symbol: string): number {
  if (symbol === NATIVE_SYMBOL) return NATIVE_DECIMALS;
  const token = ALL_BALANCE_TOKENS.find((t) => t.symbol === symbol);
  return token?.decimals ?? 18;
}
