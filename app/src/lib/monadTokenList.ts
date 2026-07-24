/**
 * Broad fallback token registry, sourced from the official Monad Mainnet token
 * list (monad-crypto/token-list, tokenlist-mainnet.json). Every address, symbol,
 * name and decimals below is copied verbatim from that maintained list and
 * normalized to an EIP-55 checksum at load. No address is invented.
 *
 * This expands the curated stablecoin + memecoin set with the widely-held
 * majors on Monad (wrapped native, LSTs, bridged BTC/ETH, notable stablecoins).
 * Native MON is deliberately EXCLUDED — it has no ERC-20 contract (the list
 * gives it 0x000…000) and is read separately via eth_getBalance.
 *
 * Inclusion here means the token is on the maintained list — it is NOT an
 * endorsement, price signal, or safety claim. ONE reads balances only.
 */

import { getAddress } from "viem";
import { MONAD_CHAIN_ID } from "./chain";

const LOGO_BASE =
  "https://raw.githubusercontent.com/monad-crypto/token-list/refs/heads/main/mainnet";

export type MonadListToken = {
  chainId: typeof MONAD_CHAIN_ID;
  /** EIP-55 checksummed Monad Mainnet address (the stable identity). */
  address: `0x${string}`;
  /** On-list symbol, verbatim. */
  symbol: string;
  /** On-list name. */
  name: string;
  decimals: number;
  /** Path segment for the on-list logo; kept for display metadata. */
  logoURI: string;
};

/** Raw list rows (symbol, name, address, decimals) from tokenlist-mainnet.json. */
const RAW: { symbol: string; name: string; address: string; decimals: number }[] = [
  // --- Required broad-fallback tokens ------------------------------------
  { symbol: "WMON", name: "Wrapped MON", address: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A", decimals: 18 },
  { symbol: "USDC", name: "USDC", address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", decimals: 6 },
  { symbol: "USDT0", name: "USDT0", address: "0xe7cd86e13AC4309349F30B3435a9d337750fC82D", decimals: 6 },
  { symbol: "AUSD", name: "AUSD", address: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", decimals: 6 },
  { symbol: "aprMON", name: "aPriori Monad LST", address: "0x0c65A0BC65a5D819235B71F554D210D3F80E0852", decimals: 18 },
  { symbol: "gMON", name: "gMON", address: "0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081", decimals: 18 },
  { symbol: "shMON", name: "ShMonad", address: "0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c", decimals: 18 },
  { symbol: "WETH", name: "Wrapped Ether", address: "0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242", decimals: 18 },
  { symbol: "WBTC", name: "Wrapped BTC", address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c", decimals: 8 },
  { symbol: "BTC.b", name: "Bitcoin", address: "0xB0F70C0bD6FD87dbEb7C10dC692a2a6106817072", decimals: 8 },

  // --- Other widely-held majors from the same list -----------------------
  { symbol: "sMON", name: "Kintsu Staked Monad", address: "0xA3227C5969757783154C60bF0bC1944180ed81B9", decimals: 18 },
  { symbol: "earnMON", name: "earnMON", address: "0x8FA1365f6E39B7404737721a356B1d4a7b11cA7D", decimals: 18 },
  { symbol: "mcMON", name: "mcMON", address: "0x1D4795A4670033f47f572b910553be0295077b51", decimals: 18 },
  { symbol: "cbBTC", name: "Coinbase Wrapped BTC", address: "0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b", decimals: 8 },
  { symbol: "LBTC", name: "Lombard Staked Bitcoin", address: "0xecAc9C5F704e954931349Da37F60E39f515c11c1", decimals: 8 },
  { symbol: "SolvBTC", name: "Solv BTC", address: "0xaE4EFbc7736f963982aACb17EFA37fCBAb924cB3", decimals: 18 },
  { symbol: "enzoBTC", name: "Lorenzo Wrapped Bitcoin", address: "0xD7aCB868F97F8286D5d3A0Fd5Ef112a8a72eCD90", decimals: 8 },
  { symbol: "wstETH", name: "Wrapped liquid staked Ether 2.0", address: "0x10Aeaf63194db8d453d4D85a06E5eFE1dd0b5417", decimals: 18 },
  { symbol: "weETH", name: "Wrapped eETH", address: "0xA3D68b74bF0528fdD07263c60d6488749044914b", decimals: 18 },
  { symbol: "ezETH", name: "Renzo Restaked ETH", address: "0x2416092f143378750bb29b79eD961ab195CcEea5", decimals: 18 },
  { symbol: "rETH", name: "Rocket Pool ETH", address: "0xC50f2e735eDd9dCD8Ccd41EcFE9894E679e3195f", decimals: 18 },
  { symbol: "USDe", name: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", decimals: 18 },
  { symbol: "sUSDe", name: "Staked USDe", address: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", decimals: 18 },
  { symbol: "ENA", name: "ENA", address: "0x58538e6A46E07434d7E7375Bc268D3cb839C0133", decimals: 18 },
  { symbol: "GHO", name: "Gho Token", address: "0xfc421aD3C883Bf9E7C4f42dE845C4e4405799e73", decimals: 18 },
  { symbol: "USD1", name: "World Liberty Financial USD", address: "0x111111d2bf19e43C34263401e0CAd979eD1cdb61", decimals: 6 },
  { symbol: "mUSD", name: "MetaMask USD", address: "0xacA92E438df0B2401fF60dA7E4337B687a2435DA", decimals: 6 },
  { symbol: "PENDLE", name: "Pendle", address: "0x5E49E1f85813F2B65858860A3FA231b4186f2e0E", decimals: 18 },
  { symbol: "Cake", name: "PancakeSwap Token", address: "0xF59D81cd43f620E722E07f9Cb3f6E41B031017a3", decimals: 18 },
  { symbol: "SOL", name: "Wrapped SOL", address: "0xea17E5a9efEBf1477dB45082d67010E2245217f1", decimals: 9 },
];

/** Symbols whose on-list logo is a .png rather than the usual .svg. */
const PNG_LOGOS = new Set(["shMON"]);

/** The registry, with every address normalized to a valid EIP-55 checksum. */
export const MONAD_LIST_TOKENS: readonly MonadListToken[] = RAW.map((t) => ({
  chainId: MONAD_CHAIN_ID,
  address: getAddress(t.address),
  symbol: t.symbol,
  name: t.name,
  decimals: t.decimals,
  logoURI: `${LOGO_BASE}/${t.symbol}/logo.${PNG_LOGOS.has(t.symbol) ? "png" : "svg"}`,
}));
