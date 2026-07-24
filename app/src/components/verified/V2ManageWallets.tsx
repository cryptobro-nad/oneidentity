"use client";

import { useCallback, useState } from "react";
import { createPublicClient, getAddress, http } from "viem";
import { useWallet } from "@/lib/wallet/useWallet";
import { monad, PRIMARY_RPC } from "@/lib/chain";
import { ONE_REGISTRY_V2_ADDRESS, ONE_REGISTRY_V2_WRITE_ABI } from "@/lib/v2link/registry";
import { V2_MANAGE_COPY } from "@/lib/v2link/copy";
import { shortenAddress } from "@/lib/format";
import { loadV2ProfileAction, type V2Profile } from "@/app/verified/v2actions";
import type { PortfolioAddress } from "@/lib/types";

const publicClient = createPublicClient({ chain: monad, transport: http(PRIMARY_RPC) });

/**
 * Linked-wallets list with removal, for an existing V2 identity.
 *
 * Only the connected primary sees Remove controls; the primary row never shows
 * one (the contract forbids removing the primary). Removal submits removeMember
 * from the primary, waits for the receipt, and re-reads membership from chain.
 * Secondary self-removal is supported at the contract level but intentionally
 * not surfaced here for launch.
 */
export function V2ManageWallets({ initial }: { initial: V2Profile }) {
  const wallet = useWallet();
  const [profile, setProfile] = useState<V2Profile>(initial);
  const [confirming, setConfirming] = useState<PortfolioAddress | null>(null);
  const [removing, setRemoving] = useState<PortfolioAddress | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const connected = wallet.address ? getAddress(wallet.address) : null;
  const isPrimaryConnected = connected !== null && connected === profile.primary;

  const reload = useCallback(async () => {
    const res = await loadV2ProfileAction(profile.address);
    if (res.ok) setProfile(res.profile);
  }, [profile.address]);

  const remove = useCallback(
    async (target: PortfolioAddress) => {
      if (!ONE_REGISTRY_V2_ADDRESS) return;
      setNotice(null);
      setConfirming(null);

      const live = await wallet.refreshAccount();
      if (!live || getAddress(live) !== profile.primary) {
        setNotice({ kind: "err", text: V2_MANAGE_COPY.onlyPrimaryManages });
        return;
      }
      if (!(await wallet.ensureOnMonad())) {
        setNotice({ kind: "err", text: "Switch to Monad Mainnet, then try again." });
        return;
      }

      setRemoving(target);
      try {
        const wc = wallet.getWalletClient();
        if (!wc) throw new Error("No wallet available.");
        const hash = await wc.writeContract({
          address: ONE_REGISTRY_V2_ADDRESS,
          abi: ONE_REGISTRY_V2_WRITE_ABI,
          functionName: "removeMember",
          args: [profile.address, target],
          account: profile.primary,
          chain: monad,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("reverted");
        await reload();
        setNotice({ kind: "ok", text: V2_MANAGE_COPY.removed });
      } catch {
        setNotice({ kind: "err", text: V2_MANAGE_COPY.removeFailed });
      } finally {
        setRemoving(null);
      }
    },
    [wallet, profile.primary, profile.address, reload],
  );

  return (
    <section className="space-y-4 rounded-[16px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-[1.3rem] leading-tight text-ink">{V2_MANAGE_COPY.linkedWallets}</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[0.72rem] ${
            profile.isActive ? "bg-success-soft text-ink" : "bg-warn-soft text-ink"
          }`}
        >
          {profile.isActive ? V2_MANAGE_COPY.active : V2_MANAGE_COPY.inactive}
        </span>
      </div>

      {!isPrimaryConnected ? (
        <p className="text-[0.82rem] text-ink-3">{V2_MANAGE_COPY.onlyPrimaryManages}</p>
      ) : null}

      <ul className="space-y-2">
        {profile.members.map((m) => {
          const isPrimary = m === profile.primary;
          // Removing the last secondary drops below the 2-member minimum and
          // permanently deactivates the identity.
          const deactivates = profile.memberCount <= 2;
          return (
            <li
              key={m}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-2/40 px-3.5 py-2.5"
            >
              <span className="flex items-center gap-2 font-mono text-[0.82rem] text-ink">
                {shortenAddress(m)}
                {isPrimary ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans text-[0.68rem] text-accent">
                    {V2_MANAGE_COPY.primaryTag}
                  </span>
                ) : null}
              </span>

              {/* Primary is never removable; only the connected primary sees Remove. */}
              {isPrimary || !isPrimaryConnected ? null : confirming === m ? (
                <span className="flex items-center gap-2">
                  <span className="text-[0.76rem] text-ink-2">
                    {V2_MANAGE_COPY.confirmRemovePrefix} {shortenAddress(m)}?
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(m)}
                    disabled={removing !== null}
                    className="rounded-[7px] px-2 py-1 font-mono text-[0.72rem] text-danger transition-colors hover:opacity-80 disabled:opacity-50"
                  >
                    {removing === m ? V2_MANAGE_COPY.removing : V2_MANAGE_COPY.remove}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded-[7px] px-2 py-1 font-mono text-[0.72rem] text-ink-3 transition-colors hover:text-ink"
                  >
                    {V2_MANAGE_COPY.cancel}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(m)}
                  disabled={removing !== null}
                  className="rounded-[7px] px-2 py-1 font-mono text-[0.72rem] text-ink-3 transition-colors hover:text-danger disabled:opacity-50"
                  title={deactivates ? "Removing the last linked wallet makes this identity inactive." : undefined}
                >
                  {deactivates ? "Remove (deactivates)" : V2_MANAGE_COPY.remove}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {confirming ? (
        <p className="text-[0.78rem] text-ink-3">{V2_MANAGE_COPY.confirmRemoveSuffix}</p>
      ) : null}
      {notice ? (
        <p className={`text-sm ${notice.kind === "ok" ? "text-success" : "text-danger"}`}>{notice.text}</p>
      ) : null}
    </section>
  );
}
