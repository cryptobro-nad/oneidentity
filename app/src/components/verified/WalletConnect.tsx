"use client";

import Image from "next/image";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import { shortenAddress } from "@/lib/format";
import type { useWallet } from "@/lib/wallet/useWallet";

type Wallet = ReturnType<typeof useWallet>;

/**
 * Rough form-factor hint, used only to choose wording.
 *
 * Never used to gate functionality: a desktop user with no extension still gets
 * the QR flow, and a phone in a wallet's in-app browser still sees its injected
 * provider. Getting this wrong changes a label, not a capability.
 */
function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function WalletConnect({ wallet }: { wallet: Wallet }) {
  if (!wallet.address) {
    const mobile = isLikelyMobile();
    const hasInjected = wallet.wallets.length > 0;

    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="text-sm font-medium text-ink">Connect a wallet</h3>
        <p className="mt-1.5 text-sm text-muted">
          ONE never asks for a private key, a token approval, or a transfer.
        </p>

        {/* Injected wallets, when the browser has any. */}
        {hasInjected ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {wallet.wallets.map((w) => (
              <li key={w.info.uuid}>
                <button
                  type="button"
                  onClick={() => void wallet.connect(w)}
                  disabled={wallet.connecting}
                  className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm text-ink transition-colors hover:bg-raised disabled:opacity-50"
                >
                  {w.info.icon ? (
                    <Image src={w.info.icon} alt="" width={18} height={18} unoptimized />
                  ) : null}
                  {w.info.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {/* WalletConnect: deep links on mobile, QR on desktop. */}
        {wallet.walletConnectAvailable ? (
          <div className={hasInjected ? "mt-3" : "mt-4"}>
            <button
              type="button"
              onClick={() => void wallet.connectWalletConnect()}
              disabled={wallet.connecting}
              className={
                hasInjected
                  ? "inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm text-ink transition-colors hover:bg-raised disabled:opacity-50"
                  : "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
              }
            >
              {wallet.connecting
                ? "Connecting…"
                : mobile
                  ? "Connect mobile wallet"
                  : hasInjected
                    ? "Or scan with a mobile wallet"
                    : "Connect with WalletConnect"}
            </button>

            <p className="mt-2 text-xs text-faint">
              {mobile
                ? "Opens your wallet app, then returns here."
                : "Shows a QR code to scan with a wallet on your phone."}
            </p>
          </div>
        ) : null}

        {/* No injected wallet and no WalletConnect: say something useful, and
            never tell a phone user to install a desktop extension. */}
        {!hasInjected && !wallet.walletConnectAvailable ? (
          <p className="mt-4 text-sm text-faint">
            {mobile
              ? "No wallet detected. Open oneidentity.app inside your wallet app's browser to connect."
              : "No browser wallet detected. Install MetaMask or Rabby, then reload this page."}
          </p>
        ) : null}

        {wallet.error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {wallet.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-faint">Connected</p>
          <p className="font-mono text-sm text-ink" title={wallet.address}>
            {shortenAddress(wallet.address)}
            {wallet.selected ? (
              <span className="ml-2 text-xs text-faint">via {wallet.selected.info.name}</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={wallet.disconnect}
          className="text-xs text-faint transition-colors hover:text-danger"
        >
          Disconnect
        </button>
      </div>

      {!wallet.isOnMonad ? (
        <div className="mt-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3">
          <p className="text-sm font-medium text-ink">Wrong network</p>
          <p className="mt-1 text-sm text-muted">
            This wallet is on chain {wallet.chainId ?? "unknown"}. Verified ONE requires Monad
            Mainnet (chain {MONAD_CHAIN_ID}).
          </p>
          <button
            type="button"
            onClick={() => void wallet.switchNetwork()}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            Switch to Monad Mainnet
          </button>
        </div>
      ) : null}
    </div>
  );
}
