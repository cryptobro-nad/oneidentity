"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AddressChip } from "@/components/AddressChip";
import { Badge } from "@/components/ui/Badge";
import { ErrorNotice } from "@/components/Notices";
import { NftHoldings } from "@/components/NftHoldings";
import { PortfolioResult } from "@/components/PortfolioResult";
import { V2ManageWallets } from "@/components/verified/V2ManageWallets";
import { WalletConnect } from "@/components/verified/WalletConnect";
import { useWallet } from "@/lib/wallet/useWallet";
import { loadPortfolioAction } from "@/app/portfolio/actions";
import { decodePortfolio } from "@/lib/wire";
import type { AggregatedPortfolio } from "@/lib/types";
import type { V2Profile } from "@/app/verified/v2actions";

/**
 * Public, cross-device view of a Verified ONE (V2) identity. Everything shown is
 * read live from Monad — membership from the V2 registry, balances from the same
 * watch-only path used everywhere else. Nothing is read from browser storage, so
 * the same address renders identically on any device.
 */
export function OneV2ProfileClient({ initial }: { initial: V2Profile }) {
  // The primary can connect here to manage from any device (removal). Viewing
  // needs no wallet — membership and balances are read straight from chain.
  const wallet = useWallet();
  // Balances aggregate only while the identity is active and has linked wallets.
  const mayAggregate = initial.isActive && initial.memberCount >= 2;

  const [portfolio, setPortfolio] = useState<AggregatedPortfolio | null>(null);
  // Starts true only when a load will actually run, so a non-aggregating
  // identity never flashes a spinner (and no setState runs inside the effect).
  const [loading, setLoading] = useState(mayAggregate);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mayAggregate) return;
    let cancelled = false;
    void loadPortfolioAction(initial.members).then((res) => {
      if (cancelled) return;
      if (res.ok) setPortfolio(decodePortfolio(res.data));
      else setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mayAggregate, initial.members]);

  return (
    <div className="space-y-8">
      <div>
        <span className="eyebrow">Verified ONE</span>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="display text-[clamp(1.8rem,4vw,2.6rem)]">Identity</h1>
          <Badge tone={initial.isActive ? "accent" : "neutral"}>
            {initial.isActive ? "Active" : "Inactive"}
          </Badge>
          <Badge tone="neutral">
            {initial.memberCount} {initial.memberCount === 1 ? "wallet" : "wallets"}
          </Badge>
        </div>
        <div className="mt-4">
          <AddressChip address={initial.address} />
        </div>
      </div>

      <WalletConnect wallet={wallet} />
      <V2ManageWallets wallet={wallet} initial={initial} />

      {mayAggregate ? (
        <div className="space-y-8">
          {loading ? (
            <p className="text-sm text-ink-3">Loading balances from Monad…</p>
          ) : error ? (
            <ErrorNotice title="Could not load balances">{error}</ErrorNotice>
          ) : portfolio ? (
            <PortfolioResult portfolio={portfolio} />
          ) : null}
          <NftHoldings addresses={initial.members} />
        </div>
      ) : (
        <p className="max-w-[62ch] text-[0.9rem] leading-relaxed text-ink-3">
          Combined balances appear once the identity is active and has at least one linked wallet.
        </p>
      )}

      <div className="border-t border-line pt-6">
        <Link href="/verified" className="btn btn-quiet">
          Link a wallet
        </Link>
      </div>
    </div>
  );
}
