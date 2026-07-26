"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWallet } from "./useWallet";

/**
 * One wallet instance for the whole app.
 *
 * useWallet() is useState-based, so calling it in multiple components creates
 * independent copies that don't see each other's connection. The header connect
 * control and every page's wallet actions must agree, so the state is lifted to
 * this provider (mounted once in the root layout) and read via useSharedWallet().
 */
const WalletContext = createContext<ReturnType<typeof useWallet> | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useSharedWallet(): ReturnType<typeof useWallet> {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useSharedWallet must be used within <WalletProvider>");
  return ctx;
}
