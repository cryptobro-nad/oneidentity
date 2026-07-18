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

/**
 * Deployed ONERegistry on Monad Mainnet.
 *
 * Public, non-secret configuration. Deployed and source-verified on
 * 2026-07-18 at block 88,632,853; Sourcify reports `exact_match` on both
 * creation and runtime bytecode. See docs/MAINNET_DEPLOYMENT.md.
 *
 * NOT USED YET. Phase 1 (the unverified portfolio) never reads the registry —
 * it only reads wallet balances. This constant exists so Verified ONE has a
 * single reviewed source for the address rather than one pasted in later.
 *
 * The env override exists for pointing a local build at a different deployment;
 * it is a public address, never a secret.
 */
export const ONE_REGISTRY_ADDRESS =
  (process.env.NEXT_PUBLIC_ONE_REGISTRY_ADDRESS as `0x${string}` | undefined) ??
  ("0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915" as const);

/**
 * EIP-712 domain of the deployed registry, read live from `eip712Domain()`.
 * Pinned here so Phase 2 can assert the chain agrees before asking anyone to
 * sign: a mismatch means the frontend is pointed at the wrong contract.
 */
export const ONE_REGISTRY_DOMAIN = {
  name: "ONE",
  version: "1",
  chainId: MONAD_CHAIN_ID,
  verifyingContract: ONE_REGISTRY_ADDRESS,
  /** Expected keccak256 of the encoded domain; verify, do not trust. */
  expectedSeparator:
    "0x960c5a75782e99137e7ed08ee5f3b96ce7f2a37516829ba3541f78e21141e184",
} as const;

/** Hard cap on wallets in a single view — matches ONERegistry's MAX_MEMBERS. */
export const MAX_WALLETS = 5;

/** Matches ONERegistry's MIN_MEMBERS. Portfolio mode allows a single wallet. */
export const MIN_WALLETS_PORTFOLIO = 1;
