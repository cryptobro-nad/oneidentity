"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import { shortenAddress } from "@/lib/format";
import { useSharedWallet } from "@/lib/wallet/WalletProvider";

/**
 * Header wallet control: a compact Connect button that opens a dropdown, and,
 * once connected, an address chip whose dot reflects the network (accent on
 * Monad, warn off it). All wallet selection, network switching and disconnect
 * live in the dropdown, so pages no longer need an inline connect box. The whole
 * app shares one wallet instance via WalletProvider, so this and every page agree.
 */
export function HeaderWallet() {
  const wallet = useSharedWallet();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const connectInjected = useCallback(
    async (w: (typeof wallet.wallets)[number]) => {
      await wallet.connect(w);
      setOpen(false);
    },
    [wallet],
  );
  const connectWC = useCallback(async () => {
    await wallet.connectWalletConnect();
    setOpen(false);
  }, [wallet]);
  const disconnect = useCallback(() => {
    wallet.disconnect();
    setOpen(false);
  }, [wallet]);

  const connected = Boolean(wallet.address);
  const wrongNetwork = connected && !wallet.isOnMonad;

  if (wallet.restoring && !connected) {
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-[7px] text-[0.72rem] text-faint">
        …
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          connected
            ? "inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-[7px] font-mono text-[0.72rem] text-ink transition-colors hover:bg-surface-2"
            : "inline-flex items-center rounded-full bg-accent px-[15px] py-[7px] text-[0.78rem] font-medium text-accent-ink transition-[filter] hover:brightness-110"
        }
      >
        {connected ? (
          <>
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${wrongNetwork ? "bg-warn" : "bg-accent"}`}
            />
            {shortenAddress(wallet.address!)}
          </>
        ) : (
          "Connect"
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-[12px] border border-line bg-surface p-3 shadow-[var(--shadow-card)]"
        >
          {connected ? (
            <div className="space-y-3">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.06em] text-faint">Connected</p>
                <p className="mt-1 break-all font-mono text-[0.8rem] text-ink">{wallet.address}</p>
                {wallet.selected ? (
                  <p className="mt-0.5 text-[0.72rem] text-faint">via {wallet.selected.info.name}</p>
                ) : null}
              </div>

              {wrongNetwork ? (
                <div className="rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2.5">
                  <p className="text-[0.8rem] font-medium text-ink">Wrong network</p>
                  <p className="mt-0.5 text-[0.74rem] text-muted">
                    Switch to Monad Mainnet (chain {MONAD_CHAIN_ID}).
                  </p>
                  <button
                    type="button"
                    onClick={() => void wallet.switchNetwork()}
                    disabled={wallet.switching}
                    className="mt-2 w-full rounded-[8px] bg-accent px-3 py-2 text-[0.78rem] font-medium text-accent-ink transition-[filter] hover:brightness-110 disabled:opacity-50"
                  >
                    {wallet.switching ? "Switching…" : "Switch to Monad Mainnet"}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={disconnect}
                className="w-full rounded-[8px] border border-line-strong bg-surface px-3 py-2 text-[0.8rem] text-ink transition-colors hover:text-danger"
              >
                Disconnect
              </button>
              {wallet.error ? <p className="text-[0.76rem] text-danger">{wallet.error}</p> : null}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="px-1 text-[0.68rem] uppercase tracking-[0.06em] text-faint">Connect a wallet</p>

              {wallet.wallets.map((w) => (
                <button
                  key={w.info.uuid}
                  type="button"
                  onClick={() => void connectInjected(w)}
                  disabled={wallet.connecting}
                  className="flex w-full items-center gap-2.5 rounded-[8px] border border-line-strong bg-surface px-3 py-2.5 text-[0.82rem] text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  {w.info.icon ? (
                    <Image src={w.info.icon} alt="" width={18} height={18} unoptimized />
                  ) : null}
                  {w.info.name}
                </button>
              ))}

              {wallet.walletConnectAvailable ? (
                <button
                  type="button"
                  onClick={() => void connectWC()}
                  disabled={wallet.connecting}
                  className="w-full rounded-[8px] border border-line-strong bg-surface px-3 py-2.5 text-[0.82rem] text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  {wallet.connecting ? "Connecting…" : "WalletConnect (mobile / QR)"}
                </button>
              ) : null}

              {wallet.wallets.length === 0 && !wallet.walletConnectAvailable ? (
                <p className="px-1 text-[0.76rem] text-faint">
                  No wallet detected. Install MetaMask or Rabby, or open this site in your wallet
                  app&apos;s browser.
                </p>
              ) : null}

              {wallet.disconnectNotice ? (
                <p className="px-1 text-[0.74rem] text-muted">{wallet.disconnectNotice}</p>
              ) : null}
              {wallet.error ? <p className="px-1 text-[0.76rem] text-danger">{wallet.error}</p> : null}

              <p className="px-1 pt-1 text-[0.7rem] leading-relaxed text-faint">
                ONE never asks for a private key, token approval, or transfer.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
