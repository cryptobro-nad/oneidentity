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

/** Minimal surface we rely on, beyond plain EIP-1193. */
type WalletConnectProvider = EIP1193Provider & {
  connect: (opts?: unknown) => Promise<unknown>;
  disconnect: () => Promise<void>;
  session?: unknown;
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

/** True when a WalletConnect session is currently established. */
export function hasWalletConnectSession(): boolean {
  return Boolean(cached?.session);
}

/** Test-only: drops the cached provider. */
export function resetWalletConnectCache(): void {
  cached = null;
}
