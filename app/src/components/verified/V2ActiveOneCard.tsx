"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getAddress } from "viem";
import { Badge } from "@/components/ui/Badge";
import { shortenAddress } from "@/lib/format";
import type { V2Profile } from "@/app/verified/v2actions";

/**
 * "Your active ONE" summary for a wallet already in a Verified ONE (V2) — the V2
 * counterpart of ActiveOneCard. Shows the identity address, the connected
 * wallet's role, the linked count, and links to the public V2 profile. Removal
 * lives in V2ManageWallets below this.
 */
export function V2ActiveOneCard({
  profile,
  connectedAddress,
}: {
  profile: V2Profile;
  connectedAddress: string;
}) {
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const profilePath = `/one-v2/${profile.address}`;
  const role = getAddress(connectedAddress) === profile.primary ? "Primary" : "Secondary";

  // Origin resolved at click time so the link is correct on preview, production,
  // or any custom domain — never a hardcoded host.
  const copy = useCallback(
    async (what: "address" | "link") => {
      const origin = typeof window === "undefined" ? "" : window.location.origin;
      const value = what === "address" ? profile.address : `${origin}${profilePath}`;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(what);
        setAnnouncement(what === "address" ? "ONE address copied." : "Profile link copied.");
      } catch {
        setAnnouncement("Copying failed. You can select and copy the address manually.");
      }
    },
    [profile.address, profilePath],
  );

  return (
    <section
      aria-labelledby="active-one-v2-heading"
      className="card border-line-strong p-6 sm:p-7"
      style={{ background: "linear-gradient(160deg, var(--surface-2), var(--surface))" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Your Verified ONE</span>
          <h2 id="active-one-v2-heading" className="mt-2 font-serif text-[1.6rem] leading-tight text-ink">
            Your active ONE
          </h2>
          <p className="mt-1.5 text-sm text-ink-2">This wallet is already linked to a Verified ONE.</p>
        </div>
        <Badge tone={profile.isActive ? "success" : "neutral"} dot>
          {profile.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <dl className="mt-5 space-y-4">
        <div>
          <dt className="eyebrow">ONE identity address</dt>
          <dd className="mono mt-1.5 text-[clamp(0.95rem,2.2vw,1.15rem)] break-all text-ink">
            {profile.address}
          </dd>
          <p className="mt-2 max-w-[46ch] text-[0.8rem] leading-relaxed text-ink-3">
            This is an identity address, not a wallet. Do not send funds to it.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-4">
          <div>
            <dt className="eyebrow">Your role</dt>
            <dd className="mt-1.5 font-mono text-sm text-ink">{role}</dd>
          </div>
          <div>
            <dt className="eyebrow">Connected wallet</dt>
            <dd className="mt-1.5 font-mono text-sm text-ink" title={connectedAddress}>
              {shortenAddress(connectedAddress)}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Linked wallets</dt>
            <dd className="tnum mt-1.5 font-mono text-sm text-ink">{profile.memberCount}</dd>
          </div>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href={profilePath} className="btn btn-primary">
          View my ONE
        </Link>
        <button type="button" onClick={() => void copy("address")} className="btn btn-ghost">
          {copied === "address" ? "Copied" : "Copy ONE address"}
        </button>
        <button type="button" onClick={() => void copy("link")} className="btn btn-ghost">
          {copied === "link" ? "Copied" : "Copy profile link"}
        </button>
      </div>

      <p aria-live="polite" role="status" className="mt-3 min-h-[1.25rem] font-mono text-[0.72rem] text-accent-live">
        {announcement}
      </p>
    </section>
  );
}
