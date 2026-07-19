"use client";

/**
 * Wallet connection state.
 *
 * Deliberately minimal: discovery via EIP-6963, connection via EIP-1193, and
 * live subscription to account/chain changes so the UI can never act on a stale
 * wallet. The signing flow depends on this being accurate — continuing with the
 * wrong account would produce a signature attributed to the wrong wallet.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, type EIP1193Provider } from "viem";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";
import {
  getChainId,
  requestAccounts,
  subscribeToProviderEvents,
  subscribeToWallets,
  switchToMonad,
  walletClientFor,
  type DiscoveredWallet,
} from "./provider";
import {
  disconnectWalletConnect,
  isWalletConnectConfigured,
  walletConnectEntry,
  restoreWalletConnectSession,
  WALLETCONNECT_UUID,
} from "./walletconnect";

export type WalletState = {
  wallets: DiscoveredWallet[];
  selected: DiscoveredWallet | null;
  address: PortfolioAddress | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  isOnMonad: boolean;
  /** True when this deployment has a WalletConnect project id configured. */
  walletConnectAvailable: boolean;
  /** True while a saved WalletConnect session is being checked on mount. */
  restoring: boolean;
  /** True while a network switch or manual re-check is in flight. */
  switching: boolean;
};

export function useWallet() {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [selected, setSelected] = useState<DiscoveredWallet | null>(null);
  const [address, setAddress] = useState<PortfolioAddress | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Starts true only when there is something that could be restored, so the UI
  // never flashes "Connect a wallet" mid-check — and never shows a restoring
  // state on a deployment that has no WalletConnect at all.
  const [restoring, setRestoring] = useState(() => isWalletConnectConfigured());
  const [switching, setSwitching] = useState(false);

  useEffect(() => subscribeToWallets(setWallets), []);

  /**
   * Restores a previously approved WalletConnect session on mount.
   *
   * Without this the app forgot every mobile connection on refresh: the module
   * cache does not survive a reload, and the provider was only ever created
   * when the user pressed Connect. `init()` rehydrates the persisted session
   * internally, so this opens no modal and prompts no wallet.
   *
   * State is written only after the await, so this never cascades a render.
   */
  useEffect(() => {
    // Nothing to restore, and `restoring` already initialised to false.
    if (!isWalletConnectConfigured()) return;

    let cancelled = false;
    const run = async () => {
      try {
        const restored = await restoreWalletConnectSession();
        if (cancelled) return;
        if (restored) {
          setSelected(restored.wallet);
          setAddress(getAddress(restored.accounts[0]!) as PortfolioAddress);
          // The real chain, whatever it is. A wrong network is still connected.
          setChainId(restored.chainId);
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  // Track account and chain changes for the connected provider.
  useEffect(() => {
    if (!selected) return;
    return subscribeToProviderEvents(selected.provider, {
      onAccountsChanged: (accounts) => {
        setAddress(accounts.length > 0 ? (getAddress(accounts[0]!) as PortfolioAddress) : null);
      },
      onChainChanged: (id) => setChainId(id),
    });
  }, [selected]);

  const connect = useCallback(async (wallet: DiscoveredWallet) => {
    setConnecting(true);
    setError(null);
    try {
      const accounts = await requestAccounts(wallet.provider);
      if (accounts.length === 0) throw new Error("No accounts were returned by the wallet.");
      const id = await getChainId(wallet.provider);
      setSelected(wallet);
      setAddress(getAddress(accounts[0]!) as PortfolioAddress);
      setChainId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0]! : String(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  /**
   * Connects through WalletConnect.
   *
   * The provider it returns is an ordinary EIP-1193 provider, so it goes
   * through exactly the same `connect` path as an injected wallet — one code
   * path, one account state, no way for the two to disagree.
   */
  const connectWalletConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const entry = await walletConnectEntry();
      // EthereumProvider.connect() opens the QR modal on desktop and
      // deep-links into an installed wallet on mobile.
      await (entry.provider as unknown as { connect: () => Promise<unknown> }).connect();
      await connect(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0]! : String(err);
      // Closing the modal is a choice, not a failure worth shouting about.
      setError(/user rejected|closed modal|user closed/i.test(message) ? null : message);
    } finally {
      setConnecting(false);
    }
  }, [connect]);

  const disconnect = useCallback(() => {
    // End the real session, not just the local view of it. Skipping this would
    // leave the wallet still paired and silently reuse it on next connect.
    if (selected?.info.uuid === WALLETCONNECT_UUID) {
      void disconnectWalletConnect();
    }
    setSelected(null);
    setAddress(null);
    setChainId(null);
    setError(null);
  }, [selected]);

  /**
   * Switches to Monad and reports the verified outcome.
   *
   * The chain is updated from what the provider actually reports afterwards,
   * so a request the wallet silently ignored can no longer look like success.
   */
  const switchNetwork = useCallback(async () => {
    if (!selected) return;
    setSwitching(true);
    setError(null);
    try {
      const outcome = await switchToMonad(selected.provider);
      if (outcome.chainId !== null) setChainId(outcome.chainId);
      setError(outcome.ok ? null : outcome.message);
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0]! : String(err));
    } finally {
      setSwitching(false);
    }
  }, [selected]);

  /**
   * Re-reads the chain without reconnecting, signing or transacting.
   *
   * The manual fallback for wallets that cannot switch programmatically: the
   * user changes network in the wallet app, comes back, and taps this.
   */
  const checkNetwork = useCallback(async () => {
    if (!selected) return;
    setSwitching(true);
    try {
      const id = await getChainId(selected.provider);
      setChainId(id);
      setError(id === MONAD_CHAIN_ID ? null : "Your wallet is still on a different network.");
    } catch {
      setError("Could not read the current network from your wallet.");
    } finally {
      setSwitching(false);
    }
  }, [selected]);

  /**
   * Re-reads accounts straight from the provider.
   *
   * Used immediately before signing: `accountsChanged` can lag, and signing
   * with a stale address would attribute the signature to the wrong wallet.
   */
  const refreshAccount = useCallback(async (): Promise<PortfolioAddress | null> => {
    if (!selected) return null;
    try {
      const accounts = (await selected.provider.request({ method: "eth_accounts" })) as string[];
      const next = accounts.length > 0 ? (getAddress(accounts[0]!) as PortfolioAddress) : null;
      setAddress(next);
      return next;
    } catch {
      return address;
    }
  }, [selected, address]);

  const getWalletClient = useCallback(() => {
    if (!selected || !address) return null;
    return walletClientFor(selected.provider as EIP1193Provider, address);
  }, [selected, address]);

  const state: WalletState = useMemo(
    () => ({
      wallets,
      selected,
      address,
      chainId,
      connecting,
      error,
      isOnMonad: chainId === MONAD_CHAIN_ID,
      // Whether this deployment can offer a mobile/QR connection at all.
      walletConnectAvailable: isWalletConnectConfigured(),
      restoring,
      switching,
    }),
    [wallets, selected, address, chainId, connecting, error, restoring, switching],
  );

  return {
    ...state,
    connect,
    connectWalletConnect,
    disconnect,
    switchNetwork,
    checkNetwork,
    refreshAccount,
    getWalletClient,
  };
}
