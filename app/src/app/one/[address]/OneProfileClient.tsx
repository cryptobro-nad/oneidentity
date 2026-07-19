"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createPublicClient, http } from "viem";
import { AddressChip } from "@/components/AddressChip";
import { ErrorNotice } from "@/components/Notices";
import { NftCollectionChecker } from "@/components/NftCollectionChecker";
import { NftHoldings } from "@/components/NftHoldings";
import { PortfolioResult } from "@/components/PortfolioResult";
import { ErrorPanel } from "@/components/verified/ReviewStep";
import { WalletConnect } from "@/components/verified/WalletConnect";
import { EXPLORER_URL, monad, ONE_REGISTRY_ADDRESS, PRIMARY_RPC } from "@/lib/chain";
import { formatBlockNumber, walletLabel } from "@/lib/format";
import { loadPortfolioAction } from "@/app/portfolio/actions";
import { ONE_REGISTRY_ABI } from "@/lib/registry/abi";
import { decodeRegistryError, type DecodedError } from "@/lib/registry/errors";
import { canRemove, removalCausesDeactivation, simulateRemoval } from "@/lib/registry/removal";
import type { OneProfile } from "@/lib/registry/profile";
import { sameAddress } from "@/lib/registry/members";
import { decodePortfolio } from "@/lib/wire";
import type { AggregatedPortfolio, PortfolioAddress } from "@/lib/types";
import { useWallet } from "@/lib/wallet/useWallet";
import { loadProfileAction } from "@/app/verified/actions";

const publicClient = createPublicClient({ chain: monad, transport: http(PRIMARY_RPC) });

type WireProfile = {
  address: PortfolioAddress;
  isActive: boolean;
  primary: PortfolioAddress;
  members: PortfolioAddress[];
  memberCount: number;
  registry: PortfolioAddress;
  blockNumber: string;
};

function toProfile(p: WireProfile): OneProfile {
  return { ...p, exists: true, blockNumber: BigInt(p.blockNumber) };
}

export function OneProfileClient({ initial }: { initial: WireProfile }) {
  const wallet = useWallet();
  const [profile, setProfile] = useState<OneProfile>(() => toProfile(initial));
  const [portfolio, setPortfolio] = useState<AggregatedPortfolio | null>(null);
  // Starts true so an active identity shows "loading" rather than a flash of
  // empty state before the first read returns.
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PortfolioAddress | null>(null);
  const [removalError, setRemovalError] = useState<DecodedError | null>(null);
  const [removalNotice, setRemovalNotice] = useState<string | null>(null);

  const mayAggregateNow = profile.isActive && profile.memberCount >= 2;

  const refreshProfile = useCallback(async () => {
    const result = await loadProfileAction(profile.address);
    if (result.ok) setProfile(toProfile(result.profile));
  }, [profile.address]);

  // Aggregation is gated on activity: ONEIdentity reverts InactiveIdentity once
  // only the primary remains, and the "combined" total would be one wallet's.
  useEffect(() => {
    if (!mayAggregateNow) return;

    let cancelled = false;
    const run = async () => {
      const res = await loadPortfolioAction(profile.members);
      if (cancelled) return;
      if (res.ok) setPortfolio(decodePortfolio(res.data));
      else setBalanceError(res.error);
      setLoadingBalances(false);
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [mayAggregateNow, profile.members]);

  // Derived, not cleared in an effect: if aggregation is not permitted there is
  // simply nothing to show, regardless of what a previous load produced.
  const shownPortfolio = mayAggregateNow ? portfolio : null;

  const remove = useCallback(
    async (target: PortfolioAddress) => {
      setRemovalError(null);
      setRemovalNotice(null);

      const permission = canRemove(profile, target, wallet.address);
      if (!permission.allowed) return;

      const client = wallet.getWalletClient();
      if (!client || !wallet.address) return;

      setRemoving(target);
      try {
        const sim = await simulateRemoval(publicClient, {
          profile,
          target,
          account: wallet.address,
        });
        if (!sim.ok) {
          setRemovalError(decodeRegistryError(sim.error));
          return;
        }

        const hash = await client.writeContract({
          address: ONE_REGISTRY_ADDRESS,
          abi: ONE_REGISTRY_ABI,
          functionName: "removeMember",
          args: [profile.address, target],
          account: wallet.address,
          chain: monad,
          gas: sim.gasPlan.gasLimit,
        });

        await publicClient.waitForTransactionReceipt({ hash });

        const bound = (await publicClient.readContract({
          address: ONE_REGISTRY_ADDRESS,
          abi: ONE_REGISTRY_ABI,
          functionName: "activeOneOf",
          args: [target],
        })) as string;

        setRemovalNotice(
          bound === "0x0000000000000000000000000000000000000000"
            ? `${target} was removed and is now unbound.`
            : `Removal sent, but ${target} still reports a binding to ${bound}.`,
        );
        await refreshProfile();
      } catch (err) {
        setRemovalError(decodeRegistryError(err));
      } finally {
        setRemoving(null);
      }
    },
    [profile, wallet, refreshProfile],
  );

  return (
    <div className="space-y-10">
      {/* Identity header */}
      <section className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs tracking-wide text-faint uppercase">ONE identity</p>
            <p className="mt-2 font-mono text-lg break-all text-ink">{profile.address}</p>
            <div className="mt-2">
              <AddressChip address={profile.address} />
            </div>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              profile.isActive
                ? "bg-accent-soft text-accent"
                : "border border-line-strong bg-raised text-muted"
            }`}
          >
            {profile.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        {!profile.isActive ? (
          <div className="mt-5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5">
            <p className="text-sm font-medium text-ink">This ONE is inactive.</p>
            <p className="mt-1 text-sm text-muted">
              Only the historical primary wallet remains, so this identity no longer represents a
              group of wallets. Its membership history stays permanently visible, but it must not
              be treated as valid for current eligibility, and combined balances are not shown.
            </p>
          </div>
        ) : null}

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-faint">Wallets in this ONE</dt>
            <dd className="tnum mt-1 text-2xl font-semibold text-ink">{profile.memberCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Network</dt>
            <dd className="mt-1 text-sm text-ink">Monad Mainnet · 143</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Block</dt>
            <dd className="tnum mt-1 text-sm text-ink">{formatBlockNumber(profile.blockNumber)}</dd>
          </div>
        </dl>

        <p className="mt-5 text-xs text-faint">
          Wallet relationships created through Verified ONE are publicly visible onchain.
        </p>
      </section>

      {/* Members */}
      <section aria-labelledby="members-heading" className="space-y-4">
        <h2 id="members-heading" className="text-lg font-medium text-ink">
          Linked wallets
        </h2>

        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {profile.members.map((member, index) => {
            const isPrimary = sameAddress(member, profile.primary);
            const permission = canRemove(profile, member, wallet.address);
            const deactivates = removalCausesDeactivation(profile, member);

            return (
              <li key={member} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-[4.5rem] shrink-0 text-xs text-faint">
                  {walletLabel(index)}
                </span>
                <div className="min-w-0 flex-1">
                  <AddressChip address={member} />
                </div>
                {isPrimary ? (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent">
                    Primary
                  </span>
                ) : (
                  <span className="text-xs text-faint">Secondary</span>
                )}

                {permission.allowed ? (
                  <button
                    type="button"
                    onClick={() => void remove(member)}
                    disabled={removing !== null}
                    className="text-xs text-faint transition-colors hover:text-danger disabled:opacity-50"
                    title={
                      deactivates
                        ? "Removing the last secondary makes this ONE permanently inactive."
                        : undefined
                    }
                  >
                    {removing === member ? "Removing…" : deactivates ? "Remove (deactivates)" : "Remove"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {profile.isActive ? (
          <p className="text-xs text-faint">
            Wallets can leave, but none can be added: membership only ever shrinks. The primary
            cannot be removed, and when the last secondary leaves, the ONE becomes permanently
            inactive.
          </p>
        ) : null}

        {removalNotice ? (
          <p role="status" className="text-sm text-muted">
            {removalNotice}
          </p>
        ) : null}
        {removalError ? <ErrorPanel error={removalError} /> : null}

        {!wallet.address ? (
          <div className="pt-2">
            <WalletConnect wallet={wallet} />
          </div>
        ) : null}
      </section>

      {/* Balances — active identities only */}
      {mayAggregateNow ? (
        <section className="border-t border-line pt-10">
          {loadingBalances ? (
            <p className="text-sm text-faint">Loading combined balances…</p>
          ) : balanceError ? (
            <ErrorNotice title="Could not load combined balances">{balanceError}</ErrorNotice>
          ) : shownPortfolio ? (
            <PortfolioResult portfolio={shownPortfolio} />
          ) : null}
        </section>
      ) : (
        <section className="border-t border-line pt-10">
          <h2 className="text-lg font-medium text-ink">Combined balances</h2>
          <p className="mt-2 text-sm text-muted">
            Not shown for an inactive identity. Aggregation is disabled on-chain once only the
            primary remains, and a single wallet&apos;s balance must not be presented as a combined
            total.
          </p>
        </section>
      )}

      {mayAggregateNow ? (
        <section className="border-t border-line pt-10">
          <NftHoldings addresses={profile.members} />
        </section>
      ) : null}

      {mayAggregateNow ? (
        <section className="border-t border-line pt-10">
          <NftCollectionChecker addresses={profile.members} />
        </section>
      ) : null}

      {/* Registry / explorer */}
      <section className="border-t border-line pt-10">
        <h2 className="text-lg font-medium text-ink">Registry</h2>
        <dl className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <dt className="text-sm text-faint">ONERegistry</dt>
            <dd>
              <AddressChip address={profile.registry} />
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <dt className="text-sm text-faint">Explorer</dt>
            <dd className="flex gap-3 text-sm">
              <a
                href={`${EXPLORER_URL}/address/${profile.address}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent hover:underline"
              >
                MonadVision
              </a>
              <a
                href={`https://monadscan.com/address/${profile.address}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent hover:underline"
              >
                Monadscan
              </a>
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-sm">
          <Link href="/verified" className="text-accent hover:underline">
            Create another Verified ONE
          </Link>
        </p>
      </section>
    </div>
  );
}
