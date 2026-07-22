"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { shortenAddress } from "@/lib/format";
import { oneProfilePath } from "@/lib/registry/lookup";
import type { MembershipActionResult } from "@/app/verified/actions";

/**
 * Surfaces the ONE a connected wallet already belongs to.
 *
 * This is the primary message for an already-linked wallet. The creation
 * guardrail still appears below it, but a returning user should not have to
 * read an error to discover their own identity address.
 */
export function ActiveOneCard({
  membership,
  connectedAddress,
}: {
  membership: Extract<MembershipActionResult, { state: "linked" }>;
  connectedAddress: string;
}) {
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  /**
   * Built from `window.location.origin` at click time, never a constant.
   *
   * The same component has to produce a correct link on localhost, on Vercel
   * preview URLs, on the current production domain and on whatever custom
   * domain is attached later. Hardcoding any of those would silently hand
   * someone a link to the wrong deployment.
   */
  const profileUrl = useCallback(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}${oneProfilePath(membership.oneAddress)}`;
  }, [membership.oneAddress]);

  const copy = useCallback(
    async (what: "address" | "link") => {
      // Always copy the FULL address, never the shortened display form.
      const value = what === "address" ? membership.oneAddress : profileUrl();
      try {
        await navigator.clipboard.writeText(value);
        setCopied(what);
        setAnnouncement(what === "address" ? "ONE address copied." : "Profile link copied.");
      } catch {
        setAnnouncement("Copying failed. You can select and copy the address manually.");
      }
    },
    [membership.oneAddress, profileUrl],
  );

  return (
    <section
      aria-labelledby="active-one-heading"
      className="card border-line-strong p-6 sm:p-7"
      style={{ background: "linear-gradient(160deg, var(--surface-2), var(--surface))" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Your Verified ONE</span>
          <h2 id="active-one-heading" className="mt-2 font-serif text-[1.6rem] leading-tight text-ink">
            Your active ONE
          </h2>
          <p className="mt-1.5 text-sm text-ink-2">
            This wallet is already linked to a Verified ONE.
          </p>
        </div>
        <Badge tone={membership.isActive ? "success" : "neutral"} dot>
          {membership.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <dl className="mt-5 space-y-4">
        <div>
          <dt className="eyebrow">ONE identity address</dt>
          <dd className="mono mt-1.5 text-[clamp(0.95rem,2.2vw,1.15rem)] break-all text-ink">
            {membership.oneAddress}
          </dd>
          <p className="mt-2 max-w-[46ch] text-[0.8rem] leading-relaxed text-ink-3">
            This is an identity address, not a wallet. Do not send funds to it.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-4">
          <div>
            <dt className="eyebrow">Your role</dt>
            <dd className="mt-1.5 font-mono text-sm text-ink">
              {membership.role === "primary" ? "Primary" : "Secondary"}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Connected wallet</dt>
            <dd className="mt-1.5 font-mono text-sm text-ink" title={connectedAddress}>
              {shortenAddress(connectedAddress)}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Linked wallets</dt>
            <dd className="tnum mt-1.5 font-mono text-sm text-ink">{membership.memberCount}</dd>
          </div>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href={oneProfilePath(membership.oneAddress)} className="btn btn-primary">
          View my ONE
        </Link>
        <button
          type="button"
          onClick={() => void copy("address")}
          className="btn btn-ghost"
        >
          {copied === "address" ? "Copied" : "Copy ONE address"}
        </button>
        <button
          type="button"
          onClick={() => void copy("link")}
          className="btn btn-ghost"
        >
          {copied === "link" ? "Copied" : "Copy profile link"}
        </button>
      </div>

      {/* Announced to screen readers without stealing focus. */}
      <p aria-live="polite" role="status" className="mt-3 min-h-[1.25rem] font-mono text-[0.72rem] text-accent-live">
        {announcement}
      </p>
    </section>
  );
}
