"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createPublicClient, http } from "viem";
import { AddressChip } from "@/components/AddressChip";
import { ErrorNotice } from "@/components/Notices";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { NftCollectionChecker } from "@/components/NftCollectionChecker";
import { NftHoldings } from "@/components/NftHoldings";
import { OneLookup } from "@/components/OneLookup";
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
import type { WireDiscoveredFungibles } from "@/lib/assets/display";
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
  const [discovered, setDiscovered] = useState<WireDiscoveredFungibles | null>(null);
  // Starts true so an active identity shows "loading" rather than a flash of
  // empty state before the first read returns.
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PortfolioAddress | null>(null);
  const [removalError, setRemovalError] = useState<DecodedError | null>(null);
  const [removalNotice, setRemovalNotice] = useState<string | null>(null);

  // Copy / share of the public identity. Presentational only: it copies the
  // real full address or the real profile URL (origin resolved at click time,
  // never hardcoded), and never changes any registry behavior.
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const [shareNote, setShareNote] = useState("");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const profileUrl = useCallback(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}/one/${profile.address}`;
  }, [profile.address]);

  const copyValue = useCallback(
    async (what: "address" | "link") => {
      const value = what === "address" ? profile.address : profileUrl();
      try {
        await navigator.clipboard.writeText(value);
        setCopied(what);
        setShareNote(what === "address" ? "Identity address copied." : "Profile link copied.");
      } catch {
        setShareNote("Copying failed. You can select and copy it manually.");
      }
    },
    [profile.address, profileUrl],
  );

  const share = useCallback(async () => {
    const url = profileUrl();
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({ title: "Verified ONE", url });
        return;
      } catch {
        // User dismissed the share sheet, or it is unavailable: fall back to copy.
      }
    }
    await copyValue("link");
  }, [profileUrl, copyValue]);

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
      if (res.ok) {
        setPortfolio(decodePortfolio(res.data));
        setDiscovered(res.data.discovered ?? null);
      } else setBalanceError(res.error);
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
  const shownDiscovered = mayAggregateNow ? discovered : null;

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
    <div className="space-y-9 sm:space-y-10">
      {/* Identity hero — a resolved identity object */}
      <section className="pt-3.5 pr-3.5">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -translate-y-3.5 translate-x-3.5 rounded-[20px] border border-line bg-surface opacity-40"
          />
          <div
            aria-hidden
            className="absolute inset-0 -translate-y-[7px] translate-x-[7px] rounded-[20px] border border-line bg-surface opacity-70"
          />
          <div
            className="card relative border-line-strong p-6 sm:p-8"
            style={{ background: "linear-gradient(160deg, var(--surface-2), var(--surface))" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="eyebrow">Verified ONE</span>
              <Badge tone={profile.isActive ? "success" : "neutral"} dot>
                {profile.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>

            <p className="mono mt-4 text-[clamp(1.1rem,3.4vw,1.8rem)] break-all tracking-[-0.01em] text-ink">
              {profile.address}
            </p>
            <p className="mt-3 max-w-[52ch] text-[0.85rem] leading-relaxed text-ink-2">
              <span className="text-ink">This is an identity address, not a wallet. Do not send funds to it.</span>{" "}
              The wallets below each authorized this Verified ONE. Their link is public on Monad
              Mainnet.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void copyValue("address")} className="btn btn-ghost">
                {copied === "address" ? "Copied" : "Copy identity address"}
              </button>
              <button type="button" onClick={() => void copyValue("link")} className="btn btn-ghost">
                {copied === "link" ? "Copied" : "Copy profile link"}
              </button>
              <button type="button" onClick={() => void share()} className="btn btn-ghost">
                Share
              </button>
              <a
                href={`${EXPLORER_URL}/address/${profile.address}`}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[0.78rem] text-ink-2 transition-colors hover:text-ink"
              >
                View on explorer
              </a>
            </div>

            <p aria-live="polite" role="status" className="mt-3 min-h-[1.1rem] font-mono text-[0.72rem] text-accent-live">
              {shareNote}
            </p>

            <dl className="mt-6 grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
              <div>
                <dt className="eyebrow">Linked wallets</dt>
                <dd className="tnum mt-1.5 font-serif text-[1.6rem] leading-none text-ink">
                  {profile.memberCount}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Network</dt>
                <dd className="mt-1.5 font-mono text-[0.85rem] text-ink">Monad Mainnet · 143</dd>
              </div>
              <div>
                <dt className="eyebrow">Block</dt>
                <dd className="tnum mt-1.5 font-mono text-[0.85rem] text-ink">
                  {formatBlockNumber(profile.blockNumber)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {!profile.isActive ? (
          <Notice tone="warn" title="This ONE is inactive." className="mt-5">
            Only the historical primary wallet remains, so this identity no longer represents a
            group of wallets. Its membership history stays permanently visible, but it must not be
            treated as valid for current eligibility, and combined balances are not shown.
          </Notice>
        ) : null}
      </section>

      {/* Members */}
      <section aria-labelledby="members-heading" className="space-y-4">
        <h2 id="members-heading" className="font-serif text-[1.6rem] leading-tight text-ink">
          Linked wallets
        </h2>

        <ul className="space-y-2">
          {profile.members.map((member, index) => {
            const isPrimary = sameAddress(member, profile.primary);
            const permission = canRemove(profile, member, wallet.address);
            const deactivates = removalCausesDeactivation(profile, member);

            return (
              <li
                key={member}
                className={
                  "flex flex-wrap items-center gap-3 rounded-[12px] border px-4 py-3 " +
                  (isPrimary
                    ? "border-accent/45 bg-surface-2 shadow-[inset_2px_0_0_0_var(--accent)]"
                    : "border-line bg-surface")
                }
              >
                <span className="shrink-0 rounded-[6px] border border-line-strong px-2 py-1 font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase">
                  {walletLabel(index)}
                </span>
                <div className="min-w-0 flex-1">
                  <AddressChip address={member} />
                </div>
                {isPrimary ? (
                  <Badge tone="accent">Primary</Badge>
                ) : (
                  <Badge tone="neutral">Secondary</Badge>
                )}

                {permission.allowed ? (
                  <button
                    type="button"
                    onClick={() => void remove(member)}
                    disabled={removing !== null}
                    className="rounded-[7px] px-2 py-1 font-mono text-[0.72rem] text-ink-3 transition-colors hover:text-danger disabled:opacity-50"
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
          <p className="max-w-[62ch] text-[0.78rem] leading-relaxed text-ink-3">
            Wallets can leave, but none can be added: membership only ever shrinks. The primary
            cannot be removed, and when the last secondary leaves, the ONE becomes permanently
            inactive.
          </p>
        ) : null}

        {removalNotice ? (
          <p role="status" className="text-sm text-ink-2">
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

      {/* What this proves */}
      <section className="rounded-[16px] border border-line bg-surface p-6 sm:p-7">
        <span className="eyebrow">What this proves</span>
        <h2 className="mt-2 font-serif text-[1.5rem] leading-tight text-ink">
          One identity, {profile.memberCount} wallets
        </h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {[
            "Each wallet above authorized the same Verified ONE by signature.",
            "No funds moved, no token approvals, and ONE never took custody.",
            "The link is recorded on Monad Mainnet, so other apps can look it up.",
            "The identity address is not a wallet and holds nothing.",
          ].map((point) => (
            <li key={point} className="flex gap-2.5 text-[0.9rem] leading-relaxed text-ink-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
              {point}
            </li>
          ))}
        </ul>
      </section>

      {/* Balances — active identities only */}
      {mayAggregateNow ? (
        <section className="border-t border-line pt-9">
          {loadingBalances ? (
            <div className="space-y-3" role="status" aria-label="Loading combined balances">
              <p className="font-mono text-[0.78rem] text-ink-3">Loading combined balances…</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-[92px] animate-pulse rounded-[14px] border border-line bg-surface-2/50" />
                ))}
              </div>
            </div>
          ) : balanceError ? (
            <ErrorNotice title="Could not load combined balances">{balanceError}</ErrorNotice>
          ) : shownPortfolio ? (
            <PortfolioResult portfolio={shownPortfolio} discovered={shownDiscovered} />
          ) : null}
        </section>
      ) : (
        <section className="border-t border-line pt-9">
          <h2 className="font-serif text-[1.5rem] leading-tight text-ink">Combined balances</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Not shown for an inactive identity. Aggregation is disabled on-chain once only the
            primary remains, and a single wallet&apos;s balance must not be presented as a combined
            total.
          </p>
        </section>
      )}

      {mayAggregateNow ? (
        <section className="border-t border-line pt-9">
          <NftHoldings addresses={profile.members} />
        </section>
      ) : null}

      {mayAggregateNow ? (
        <section className="border-t border-line pt-9">
          <NftCollectionChecker addresses={profile.members} />
        </section>
      ) : null}

      {/* Registry / explorer */}
      <section className="border-t border-line pt-9">
        <h2 className="font-serif text-[1.5rem] leading-tight text-ink">Registry</h2>
        <dl className="mt-4 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
            <dt className="font-mono text-[0.78rem] text-ink-3">ONERegistry</dt>
            <dd>
              <AddressChip address={profile.registry} />
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
            <dt className="font-mono text-[0.78rem] text-ink-3">Explorer</dt>
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

      <section className="border-t border-line pt-9">
        <OneLookup compact />
      </section>
    </div>
  );
}
