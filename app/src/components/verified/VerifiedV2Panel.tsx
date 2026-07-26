"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet/useWallet";
import { WalletConnect } from "@/components/verified/WalletConnect";
import { LinkWalletV2 } from "@/components/verified/LinkWalletV2";
import { V2ManageWallets } from "@/components/verified/V2ManageWallets";
import { V2ActiveOneCard } from "@/components/verified/V2ActiveOneCard";
import { loadV2ProfileAction, type V2Profile } from "@/app/verified/v2actions";

/**
 * The V2 method surface: connect the primary, link a wallet by transfer, and
 * manage the wallets already linked. The secondary wallet never connects here.
 */
export function VerifiedV2Panel() {
  const wallet = useWallet();
  const [profile, setProfile] = useState<{ forWallet: string; value: V2Profile | null } | null>(null);

  const load = useCallback(async (addr: string) => {
    const res = await loadV2ProfileAction(addr);
    return res.ok ? res.profile : null;
  }, []);

  // Re-read the connected wallet's V2 identity whenever it changes. Read from
  // chain only — never from browser storage — so any device shows the same
  // state. When no wallet is connected there is nothing to load; the derived
  // `current` below already ignores any stale profile.
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

  // Only trust the profile if it describes the currently connected wallet.
  const current =
    wallet.address && profile?.forWallet.toLowerCase() === wallet.address.toLowerCase()
      ? profile.value
      : null;

  const refresh = useCallback(() => {
    if (!wallet.address) return;
    const addr = wallet.address;
    void load(addr).then((value) => setProfile({ forWallet: addr, value }));
  }, [wallet.address, load]);

  return (
    <div className="space-y-8">
      <WalletConnect wallet={wallet} elevated />
      {current && wallet.address ? (
        <>
          <V2ActiveOneCard profile={current} connectedAddress={wallet.address} />
          <V2ManageWallets key={current.address} wallet={wallet} initial={current} />
        </>
      ) : null}
      <LinkWalletV2 wallet={wallet} onLinked={refresh} />
    </div>
  );
}
