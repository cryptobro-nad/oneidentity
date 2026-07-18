"use client";

import Image from "next/image";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import { shortenAddress } from "@/lib/format";
import type { useWallet } from "@/lib/wallet/useWallet";

type Wallet = ReturnType<typeof useWallet>;

export function WalletConnect({ wallet }: { wallet: Wallet }) {
  if (!wallet.address) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="text-sm font-medium text-ink">Connect a wallet</h3>
        <p className="mt-1.5 text-sm text-muted">
          ONE never asks for a private key, a token approval, or a transfer.
        </p>

        {wallet.wallets.length === 0 ? (
          <p className="mt-4 text-sm text-faint">
            No browser wallet detected. Install MetaMask or Rabby, then reload this page.
          </p>
        ) : (
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
        )}

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
