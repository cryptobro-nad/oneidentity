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

export type SupportedStablecoin = {
  chainId: typeof MONAD_CHAIN_ID;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
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

export function decimalsForSymbol(symbol: string): number {
  if (symbol === NATIVE_SYMBOL) return NATIVE_DECIMALS;
  const token = SUPPORTED_STABLECOINS.find((t) => t.symbol === symbol);
  return token?.decimals ?? 18;
}
