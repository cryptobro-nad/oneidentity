/**
 * Wallet discovery and connection.
 *
 * Uses EIP-6963 (multi-injected provider discovery) plus viem's `custom`
 * transport. That is deliberately the whole dependency footprint: no wagmi, no
 * connector framework, no WalletConnect project ID, no social login. EIP-6963
 * is what MetaMask and Rabby already announce themselves with, so this supports
 * every injected wallet without adding a package.
 *
 * This module never sees a private key, never requests approvals, and never
 * initiates transfers. It reads accounts, reads the chain, requests a chain
 * switch, signs typed data, and sends the one createOne / removeMember call.
 */

import {
  createWalletClient,
  custom,
  getAddress,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { MONAD_CHAIN_ID, monad } from "@/lib/chain";

export type WalletInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type DiscoveredWallet = { info: WalletInfo; provider: EIP1193Provider };

type Eip6963AnnounceEvent = CustomEvent<DiscoveredWallet>;

/** Monad Mainnet as wallet_addEthereumChain expects it. */
export const MONAD_CHAIN_PARAMS = {
  chainId: `0x${MONAD_CHAIN_ID.toString(16)}` as `0x${string}`,
  chainName: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: [monad.rpcUrls.default.http[0]!],
  blockExplorerUrls: ["https://monadscan.com"],
};

/**
 * Subscribes to EIP-6963 announcements.
 *
 * Wallets announce in response to the request event, so we listen first and
 * then request. Returns an unsubscribe function.
 */
export function subscribeToWallets(
  onChange: (wallets: DiscoveredWallet[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const found = new Map<string, DiscoveredWallet>();

  const handler = (event: Event) => {
    const detail = (event as Eip6963AnnounceEvent).detail;
    if (!detail?.info?.uuid) return;
    found.set(detail.info.uuid, detail);
    onChange([...found.values()]);
  };

  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Fallback for wallets that predate EIP-6963 and only set window.ethereum.
  const legacy = (window as { ethereum?: EIP1193Provider }).ethereum;
  if (legacy && found.size === 0) {
    found.set("legacy-injected", {
      info: {
        uuid: "legacy-injected",
        name: "Injected wallet",
        icon: "",
        rdns: "legacy.injected",
      },
      provider: legacy,
    });
    onChange([...found.values()]);
  }

  return () => window.removeEventListener("eip6963:announceProvider", handler);
}

export async function requestAccounts(provider: EIP1193Provider): Promise<string[]> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  return accounts.map((a) => getAddress(a));
}

export async function getChainId(provider: EIP1193Provider): Promise<number> {
  const hex = (await provider.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(hex, 16);
}

/**
 * Switches the wallet to Monad Mainnet, adding the chain if unknown.
 *
 * 4902 means "unrecognized chain"; that is the only case where adding is
 * appropriate. Any other error is surfaced rather than swallowed.
 */
export async function switchToMonad(provider: EIP1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_CHAIN_PARAMS.chainId }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [MONAD_CHAIN_PARAMS],
      });
      return;
    }
    throw error;
  }
}

export function walletClientFor(
  provider: EIP1193Provider,
  account: `0x${string}`,
): WalletClient {
  return createWalletClient({ account, chain: monad, transport: custom(provider) });
}

/** Subscribes to account/chain changes so the UI never shows a stale wallet. */
export function subscribeToProviderEvents(
  provider: EIP1193Provider,
  handlers: { onAccountsChanged: (a: string[]) => void; onChainChanged: (id: number) => void },
): () => void {
  const accountsHandler = (accounts: unknown) => {
    handlers.onAccountsChanged((accounts as string[]).map((a) => getAddress(a)));
  };
  const chainHandler = (chainId: unknown) => {
    handlers.onChainChanged(Number.parseInt(chainId as string, 16));
  };

  const emitter = provider as unknown as {
    on?: (event: string, cb: (arg: unknown) => void) => void;
    removeListener?: (event: string, cb: (arg: unknown) => void) => void;
  };

  emitter.on?.("accountsChanged", accountsHandler);
  emitter.on?.("chainChanged", chainHandler);

  return () => {
    emitter.removeListener?.("accountsChanged", accountsHandler);
    emitter.removeListener?.("chainChanged", chainHandler);
  };
}
