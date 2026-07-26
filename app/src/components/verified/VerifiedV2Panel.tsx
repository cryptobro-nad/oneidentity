"use client";

import { useCallback, useEffect, useState } from "react";
import { useSharedWallet } from "@/lib/wallet/WalletProvider";
import { LinkWalletV2 } from "@/components/verified/LinkWalletV2";
import { V2ManageWallets } from "@/components/verified/V2ManageWallets";
import { V2ActiveOneCard } from "@/components/verified/V2ActiveOneCard";
import { loadV2ProfileAction, type V2Profile } from "@/app/verified/v2actions";

/**
 * The V2 method surface: link a wallet by transfer, and manage the wallets
 * already linked. Connecting the primary happens in the header (one shared
 * wallet), so this page has no inline connect box. The wallet being linked never
 * connects here.
 */
export function VerifiedV2Panel() {
  const wallet = useSharedWallet();
  const [profile, setProfile] = useState<{ forWallet: string; value: V2Profile | null } | null>(null);

  const load = useCallback(async (addr: string) => {
    const res = await loadV2ProfileAction(addr);
    return res.ok ? res.profile : null;
  }, []);

  // Re-read the connected wallet's V2 identity whenever it changes. Read from
  // chain only — never browser storage — so any device shows the same state.
  useEffect(() => {
    const addr = wallet.address;
    if (!addr) return;
    let cancelled = false;
    void load(addr).then((value) => {
      if (!cancelled) setProfile({ forWallet: addr, value });
    });
    return () => {
      cancelled = true;
    };
  }, [wallet.address, load]);

  const current =
    wallet.address && profile?.forWallet.toLowerCase() === wallet.address.toLowerCase()
      ? profile.value
      : null;

  const refresh = useCallback(() => {
    if (!wallet.address) return;
    const addr = wallet.address;
    void load(addr).then((value) => setProfile({ forWallet: addr, value }));
  }, [wallet.address, load]);

  if (wallet.restoring && !wallet.address) {
    return (
      <p role="status" className="text-sm text-muted">
        Restoring wallet session…
      </p>
    );
  }

  // Disconnected: a clear prompt pointing at the header Connect control, instead
  // of a bare disabled form.
  if (!wallet.address) {
    return (
      <div className="card p-7 text-center sm:p-9">
        <h3 className="font-serif text-[1.4rem] leading-tight text-ink">Connect your wallet</h3>
        <p className="mx-auto mt-2.5 max-w-[46ch] text-sm leading-relaxed text-ink-2">
          Connect your primary wallet with the <span className="font-medium text-ink">Connect</span>{" "}
          button in the top right to create your Verified ONE or manage an existing one.
        </p>
        <p className="mx-auto mt-2 max-w-[46ch] text-[0.8rem] text-ink-3">
          Only your primary wallet connects. The wallets you link never connect here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!wallet.isOnMonad ? (
        <div className="rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-muted">
          Your wallet is on the wrong network. Open the wallet menu (top right) and switch to Monad
          Mainnet.
        </div>
      ) : null}

      {current ? (
        <>
          <V2ActiveOneCard profile={current} connectedAddress={wallet.address} />
          <V2ManageWallets key={current.address} wallet={wallet} initial={current} />
        </>
      ) : null}

      <LinkWalletV2 wallet={wallet} onLinked={refresh} />
    </div>
  );
}
