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

export type WalletState = {
  wallets: DiscoveredWallet[];
  selected: DiscoveredWallet | null;
  address: PortfolioAddress | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  isOnMonad: boolean;
};

export function useWallet() {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [selected, setSelected] = useState<DiscoveredWallet | null>(null);
  const [address, setAddress] = useState<PortfolioAddress | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeToWallets(setWallets), []);

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

  const disconnect = useCallback(() => {
    setSelected(null);
    setAddress(null);
    setChainId(null);
    setError(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!selected) return;
    setError(null);
    try {
      await switchToMonad(selected.provider);
      setChainId(await getChainId(selected.provider));
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0]! : String(err));
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
    }),
    [wallets, selected, address, chainId, connecting, error],
  );

  return { ...state, connect, disconnect, switchNetwork, refreshAccount, getWalletClient };
}
