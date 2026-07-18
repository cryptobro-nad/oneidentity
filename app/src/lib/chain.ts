/**
 * Monad Mainnet configuration.
 *
 * Every value here was verified live against the chain in
 * `spikes/mainnet-data/` — see that spike's REPORT.md for the evidence.
 * Do not change these without re-running the spike.
 */

import { defineChain } from "viem";

export const MONAD_CHAIN_ID = 143 as const;

/** Confirmed deployed on Monad Mainnet (code present at this address). */
export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/**
 * Ordered by measured median latency. The portfolio loader walks this list and
 * falls back on the next entry when one fails outright.
 *
 * Measured 2026-07-18: primary 57ms, fallback 62ms.
 */
export const RPC_ENDPOINTS = [
  "https://rpc.monad.xyz",
  "https://rpc3.monad.xyz",
] as const;

export const PRIMARY_RPC = RPC_ENDPOINTS[0];
export const FALLBACK_RPC = RPC_ENDPOINTS[1];

export const EXPLORER_URL = "https://monadvision.com";

export const monad = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [...RPC_ENDPOINTS] } },
  blockExplorers: { default: { name: "MonadVision", url: EXPLORER_URL } },
  contracts: { multicall3: { address: MULTICALL3_ADDRESS } },
});

/** Hard cap on wallets in a single view — matches ONERegistry's MAX_MEMBERS. */
export const MAX_WALLETS = 5;

/** Matches ONERegistry's MIN_MEMBERS. Portfolio mode allows a single wallet. */
export const MIN_WALLETS_PORTFOLIO = 1;
