/**
 * Curated stablecoin configuration for the ONE prototype, plus the live
 * verification that earns a token its place on the list.
 *
 * Addresses come from the official Monad token list:
 *   https://github.com/monad-crypto/token-list  (tokenlist-mainnet.json)
 * They are re-fetched and re-checked against the live chain by
 * `verifyStablecoin` — the constants below are a pin, not a source of truth.
 */

import { erc20Abi, getAddress, type Address, type PublicClient } from "viem";
import { MONAD_CHAIN_ID } from "./rpc.js";

export type SupportedStablecoin = {
  chainId: 143;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
};

export const OFFICIAL_TOKENLIST_URL =
  "https://raw.githubusercontent.com/monad-crypto/token-list/refs/heads/main/tokenlist-mainnet.json";

/**
 * The prototype's curated display list. Deliberately only three tokens.
 * mUSD is intentionally excluded pending explicit approval — see `CANDIDATES`.
 */
export const SUPPORTED_STABLECOINS: SupportedStablecoin[] = [
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
];

/** Tested and reported on, but NOT part of the prototype configuration. */
export const CANDIDATES_NOT_CONFIGURED: SupportedStablecoin[] = [
  {
    chainId: MONAD_CHAIN_ID,
    address: "0xacA92E438df0B2401fF60dA7E4337B687a2435DA",
    name: "MetaMask USD",
    symbol: "mUSD",
    decimals: 6,
  },
];

export type TokenListEntry = {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
};

export type TokenListFetch = {
  url: string;
  ok: boolean;
  listName: string | null;
  version: string | null;
  timestamp: string | null;
  tokenCount: number;
  entries: TokenListEntry[];
  error: string | null;
};

export async function fetchOfficialTokenList(): Promise<TokenListFetch> {
  const base: TokenListFetch = {
    url: OFFICIAL_TOKENLIST_URL,
    ok: false,
    listName: null,
    version: null,
    timestamp: null,
    tokenCount: 0,
    entries: [],
    error: null,
  };
  try {
    const res = await fetch(OFFICIAL_TOKENLIST_URL);
    if (!res.ok) return { ...base, error: `HTTP ${res.status}` };
    const json = (await res.json()) as {
      name?: string;
      timestamp?: string;
      version?: { major: number; minor: number; patch: number };
      tokens?: TokenListEntry[];
    };
    const tokens = json.tokens ?? [];
    return {
      ...base,
      ok: true,
      listName: json.name ?? null,
      version: json.version
        ? `${json.version.major}.${json.version.minor}.${json.version.patch}`
        : null,
      timestamp: json.timestamp ?? null,
      tokenCount: tokens.length,
      entries: tokens,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

export type StablecoinVerification = {
  configured: SupportedStablecoin;
  /** Present in the official list at the configured address? */
  inOfficialTokenList: boolean;
  tokenListMatchesConfig: boolean;
  hasCode: boolean;
  codeSize: number;
  onChain: {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
  };
  /** balanceOf against a live address and the zero address. */
  balanceOfWorks: boolean;
  balanceOfSample: string | null;
  /** EIP-1967 / EIP-1822 proxy slots, read directly from storage. */
  proxy: {
    looksProxied: boolean;
    eip1967Implementation: string | null;
    eip1967Admin: string | null;
    eip1822Implementation: string | null;
  };
  metadataMatchesConfig: boolean;
  errors: string[];
  verdict: "SAFE_FOR_PROTOTYPE" | "NEEDS_REVIEW" | "FAILED";
};

// EIP-1967: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
// EIP-1967: bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1)
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
// EIP-1822 UUPS: keccak256("PROXIABLE")
const EIP1822_IMPL_SLOT =
  "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7" as const;

const nonZeroSlot = (v: string | undefined): string | null => {
  if (!v || /^0x0*$/.test(v)) return null;
  return `0x${v.slice(-40)}`;
};

export async function verifyStablecoin(
  client: PublicClient,
  configured: SupportedStablecoin,
  tokenList: TokenListEntry[],
  probeAddress: Address,
): Promise<StablecoinVerification> {
  const errors: string[] = [];
  const address = getAddress(configured.address);

  const listed = tokenList.find(
    (t) =>
      t.chainId === MONAD_CHAIN_ID &&
      getAddress(t.address as `0x${string}`) === address,
  );

  let codeSize = 0;
  try {
    const code = await client.getCode({ address });
    codeSize = code && code !== "0x" ? (code.length - 2) / 2 : 0;
  } catch (err) {
    errors.push(`getCode: ${err instanceof Error ? err.message : String(err)}`);
  }

  const read = async <T>(fn: string, args: readonly unknown[] = []): Promise<T | null> => {
    try {
      return (await client.readContract({
        address,
        abi: erc20Abi,
        functionName: fn as "name",
        args: args as [],
      })) as T;
    } catch (err) {
      errors.push(`${fn}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      return null;
    }
  };

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    read<string>("name"),
    read<string>("symbol"),
    read<number>("decimals"),
    read<bigint>("totalSupply"),
  ]);

  let balanceOfWorks = false;
  let balanceOfSample: string | null = null;
  try {
    // Two calls: a live address and the zero address. A conforming token
    // answers both without reverting.
    const [live, zero] = await Promise.all([
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [probeAddress],
      }),
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: ["0x0000000000000000000000000000000000000000"],
      }),
    ]);
    balanceOfWorks = typeof live === "bigint" && typeof zero === "bigint";
    balanceOfSample = (live as bigint).toString();
  } catch (err) {
    errors.push(`balanceOf: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }

  const slot = async (s: `0x${string}`): Promise<string | null> => {
    try {
      const v = await client.getStorageAt({ address, slot: s });
      return nonZeroSlot(v);
    } catch {
      return null;
    }
  };
  const [impl1967, admin1967, impl1822] = await Promise.all([
    slot(EIP1967_IMPL_SLOT),
    slot(EIP1967_ADMIN_SLOT),
    slot(EIP1822_IMPL_SLOT),
  ]);
  const looksProxied = Boolean(impl1967 || impl1822);

  const metadataMatchesConfig =
    symbol === configured.symbol && decimals === configured.decimals;

  const tokenListMatchesConfig = Boolean(
    listed &&
      listed.symbol === configured.symbol &&
      listed.decimals === configured.decimals,
  );

  let verdict: StablecoinVerification["verdict"] = "SAFE_FOR_PROTOTYPE";
  if (codeSize === 0 || !balanceOfWorks || decimals === null) verdict = "FAILED";
  else if (!metadataMatchesConfig || !tokenListMatchesConfig) verdict = "NEEDS_REVIEW";

  return {
    configured,
    inOfficialTokenList: Boolean(listed),
    tokenListMatchesConfig,
    hasCode: codeSize > 0,
    codeSize,
    onChain: {
      name,
      symbol,
      decimals,
      totalSupply: totalSupply === null ? null : totalSupply.toString(),
    },
    balanceOfWorks,
    balanceOfSample,
    proxy: {
      looksProxied,
      eip1967Implementation: impl1967,
      eip1967Admin: admin1967,
      eip1822Implementation: impl1822,
    },
    metadataMatchesConfig,
    errors,
    verdict,
  };
}
