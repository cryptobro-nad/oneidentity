"use client";

import { useEffect, useState } from "react";
import { EXPLORER_URL } from "@/lib/chain";
import { shortenAddress } from "@/lib/format";

/**
 * Shows a shortened address while keeping the full value reachable: the title
 * attribute reveals it on hover, copy puts it on the clipboard, and the
 * explorer link opens it. Truncation is never the only representation.
 */
export function AddressChip({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the explorer link and title still work.
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-mono text-sm text-ink" title={address}>
        {shortenAddress(address)}
      </span>
      <button
        type="button"
        onClick={copy}
        className="rounded px-1 py-0.5 text-[11px] text-faint transition-colors hover:text-accent"
        aria-label={copied ? "Address copied" : `Copy full address ${address}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a
        href={`${EXPLORER_URL}/address/${address}`}
        target="_blank"
        rel="noreferrer noopener"
        className="rounded px-1 py-0.5 text-[11px] text-faint transition-colors hover:text-accent"
        aria-label={`View ${address} on MonadVision`}
      >
        View
      </a>
    </span>
  );
}
