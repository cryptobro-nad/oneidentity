/**
 * WalletConnect as an additional EIP-1193 provider.
 *
 * ## Why this shape
 *
 * ONE's wallet layer is already EIP-1193-native: everything downstream —
 * `useWallet`, viem's `custom()` transport, EIP-712 signing, `createOne`,
 * `removeMember`, chain switching — talks to a `DiscoveredWallet` holding an
 * `EIP1193Provider`. WalletConnect's official provider implements exactly that
 * interface, so it can be added as one more entry in the same list instead of
 * introducing a parallel connector framework.
 *
 * That matters for correctness, not just size. A separate WalletConnect account
 * state could disagree with the injected one about which address is connected,
 * and the whole signing flow depends on knowing the connected account exactly.
 * Keeping a single list makes that disagreement impossible to represent.
 *
 * ## Loading
 *
 * The SDK is imported dynamically, only when the user actually chooses to
 * connect this way. It is a large dependency and most visitors never touch it —
 * public portfolio, lookup and profile pages need no wallet at all.
 *
 * ## Without a project ID
 *
 * Everything here degrades to "unavailable". Injected wallets keep working,
 * public pages keep working, and builds and CI keep passing.
 */

import type { EIP1193Provider } from "viem";
import { MONAD_CHAIN_ID, monad } from "@/lib/chain";
import type { DiscoveredWallet } from "./provider";

/** Stable id for the WalletConnect entry in the wallet list. */
export const WALLETCONNECT_UUID = "walletconnect";

/**
 * Reown/WalletConnect project id.
 *
 * `NEXT_PUBLIC_` is correct here: a WalletConnect project id is a public
 * client identifier, not a secret, and the browser must have it to open a
 * session. It is still never hardcoded or logged.
 */
export function walletConnectProjectId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  return id && id.length > 0 ? id : undefined;
}

export function isWalletConnectConfigured(): boolean {
  return walletConnectProjectId() !== undefined;
}

/**
 * The documented public surface of EthereumProvider that we rely on.
 *
 * Verified against the installed @walletconnect/ethereum-provider@2.23.10 type
 * declarations — every member here is public. Notably `loadPersistedSession()`
 * and `switchEthereumChain()` are `protected` in this version and are therefore
 * NOT used, and `setDefaultChain` does not exist in this version at all.
 */
type WalletConnectProvider = EIP1193Provider & {
  connect: (opts?: unknown) => Promise<unknown>;
  disconnect: () => Promise<void>;
  /** Public getter. Defined only once a session has been established. */
  session?: unknown;
  /** Public property, populated by init() from any persisted session. */
  accounts?: string[];
  /** Public property: the provider's view of the current chain. */
  chainId?: number;
};

let cached: WalletConnectProvider | null = null;

/**
 * Creates (or reuses) the WalletConnect provider.
 *
 * `showQrModal: true` is what makes this work on both form factors: the modal
 * shows a QR code on desktop, and on mobile it lists installed wallets and
 * deep-links into them. That is the entire mobile story — no separate mobile
 * code path to keep in sync.
 */
export async function getWalletConnectProvider(): Promise<WalletConnectProvider> {
  const projectId = walletConnectProjectId();
  if (!projectId) {
    throw new Error(
      "Mobile wallet connection is not configured for this deployment.",
    );
  }

  if (cached) return cached;

  // Dynamic import: never in the initial bundle for visitors who only read.
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");

  const provider = (await EthereumProvider.init({
    projectId,
    // Monad only. Offering chains ONE cannot use would invite a session that
    // immediately fails the wrong-network check.
    chains: [MONAD_CHAIN_ID],
    optionalChains: [MONAD_CHAIN_ID],
    showQrModal: true,
    rpcMap: { [MONAD_CHAIN_ID]: monad.rpcUrls.default.http[0]! },
    metadata: {
      name: "ONE",
      description: "Many wallets. One onchain identity.",
      // Derived from the running origin so the wallet shows the right site on
      // localhost, previews and production alike.
      url: typeof window === "undefined" ? "https://oneidentity.app" : window.location.origin,
      icons: ["https://oneidentity.app/icon.png"],
    },
  })) as unknown as WalletConnectProvider;

  cached = provider;
  return provider;
}

/** The wallet-list entry, shaped exactly like an injected wallet. */
export async function walletConnectEntry(): Promise<DiscoveredWallet> {
  const provider = await getWalletConnectProvider();
  return {
    info: {
      uuid: WALLETCONNECT_UUID,
      name: "WalletConnect",
      icon: "",
      rdns: "org.walletconnect",
    },
    provider: provider as EIP1193Provider,
  };
}

/**
 * Ends the WalletConnect session properly.
 *
 * Clearing local state alone would leave the wallet believing it is still
 * paired, so the next connect would silently reuse a session the user thought
 * they had ended.
 */
export async function disconnectWalletConnect(): Promise<void> {
  if (!cached) return;
  try {
    await cached.disconnect();
  } catch {
    // A session that is already gone is not an error worth surfacing.
  } finally {
    cached = null;
  }
}

/**
 * True when a WalletConnect session is currently established.
 *
 * Deliberately checks `session`, NOT the `connected` getter. In this version
 * `connected` returns `relayer.connected` — websocket connectivity to the
 * relay, which is false while the socket is still coming up even when a
 * perfectly good session exists. Using it here would drop valid sessions.
 */
export function hasWalletConnectSession(): boolean {
  return Boolean(cached?.session);
}

export type RestoredSession = {
  wallet: DiscoveredWallet;
  accounts: string[];
  chainId: number;
};

/**
 * Restores a previously approved session, if one exists.
 *
 * `EthereumProvider.init()` already calls `loadPersistedSession()` internally
 * (verified in the installed 2.23.10 source), so simply initialising is enough
 * to rehydrate `session`, `accounts` and `chainId` from storage. Nothing here
 * calls `connect()` or `enable()`, so no modal opens and the wallet is never
 * prompted.
 *
 * Returns null when there is nothing to restore — including after a deliberate
 * disconnect, because the provider's own `disconnect()` removes the persisted
 * session. That is why no custom "remember me" flag is needed, and why one
 * would be wrong: it could claim a connection the wallet no longer honours.
 *
 * A session that exists but yields no accounts is treated as unusable and
 * cleared, rather than shown as a connection with no address.
 */
export async function restoreWalletConnectSession(): Promise<RestoredSession | null> {
  if (!isWalletConnectConfigured()) return null;

  try {
    const provider = await getWalletConnectProvider();

    if (!provider.session) return null;

    // Prefer the live account list over the cached property.
    let accounts: string[] = [];
    try {
      accounts = ((await provider.request({ method: "eth_accounts" })) as string[]) ?? [];
    } catch {
      accounts = provider.accounts ?? [];
    }
    if (accounts.length === 0) accounts = provider.accounts ?? [];

    if (accounts.length === 0) {
      // A session with no usable account is stale. Clear it so the user gets a
      // clean connect prompt instead of a connected-looking dead end.
      await disconnectWalletConnect();
      return null;
    }

    // Read the chain from the provider, never assume Monad. A wrong network is
    // a connected wallet that needs switching, not a failed restoration.
    let chainId: number;
    try {
      const hex = (await provider.request({ method: "eth_chainId" })) as string;
      chainId = Number.parseInt(hex, 16);
    } catch {
      chainId = provider.chainId ?? 0;
    }
    if (!Number.isFinite(chainId) || chainId === 0) chainId = provider.chainId ?? 0;

    return {
      wallet: {
        info: {
          uuid: WALLETCONNECT_UUID,
          name: "WalletConnect",
          icon: "",
          rdns: "org.walletconnect",
        },
        provider: provider as EIP1193Provider,
      },
      accounts,
      chainId,
    };
  } catch {
    // Restoration is best-effort: a failure here must fall through to the
    // normal connect UI, never surface as an error the user cannot act on.
    return null;
  }
}

/** Test-only: drops the cached provider. */
export function resetWalletConnectCache(): void {
  cached = null;
}
