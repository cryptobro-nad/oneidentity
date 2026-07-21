"use client";

import { useCallback, useEffect, useState } from "react";
import { AddressChip } from "@/components/AddressChip";
import { ErrorNotice } from "@/components/Notices";
import { formatCount, pluralise, shortenAddress, walletLabel } from "@/lib/format";
import { loadNftHoldingsAction, type NftHoldingsResult, type WireCollection } from "@/app/nft-actions";
import type { PortfolioAddress } from "@/lib/types";

/**
 * Automatic NFT holdings.
 *
 * Names and candidate collections come from an indexer; every number on screen
 * is an on-chain `balanceOf` re-read through Multicall3. No images are fetched
 * and no token IDs are inferred — only what the chain confirms is shown.
 */
export function NftHoldings({
  addresses,
  heading = "NFT holdings",
}: {
  addresses: PortfolioAddress[];
  heading?: string;
}) {
  const [result, setResult] = useState<NftHoldingsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((address: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  }, []);

  useEffect(() => {
    if (addresses.length === 0) return;
    let cancelled = false;

    const run = async () => {
      const res = await loadNftHoldingsAction(addresses);
      if (cancelled) return;
      setResult(res);
      setLoading(false);
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [addresses]);

  if (addresses.length === 0) return null;

  return (
    <section aria-labelledby="nft-holdings-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="nft-holdings-heading" className="text-xl font-semibold tracking-[-0.01em] text-ink">
          {heading}
        </h2>
        {result?.ok ? (
          <p className="tnum text-xs text-faint">
            Verified onchain at block {Number(result.blockNumber).toLocaleString("en-US")}
          </p>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-faint">Checking collections…</p> : null}

      {result && !result.ok ? (
        <ErrorNotice title="Could not load NFT holdings">{result.error}</ErrorNotice>
      ) : null}

      {result?.ok ? (
        <>
          <DiscoveryStatus discovery={result.discovery} />

          {result.verificationPartial ? (
            <div role="status" className="rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3">
              <p className="text-sm font-medium text-ink">Some balance checks failed</p>
              <p className="mt-1 text-sm text-muted">
                Rows marked <span className="text-danger">Failed</span> could not be read from the
                chain. They are excluded from the combined count rather than counted as zero, so
                totals below are a lower bound.
              </p>
            </div>
          ) : null}

          {result.collections.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-line-strong px-4 py-10 text-center text-sm text-faint">
              {result.discovery.state === "complete"
                ? "No ERC-721 collections found for these wallets."
                : "No collections found. Automatic discovery is unavailable, so only known collections were checked."}
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
              {result.collections.map((c) => (
                <CollectionRow
                  key={`${c.chainId}:${c.contractAddress}`}
                  collection={c}
                  expanded={expanded.has(c.contractAddress)}
                  onToggle={() => toggle(c.contractAddress)}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

function DiscoveryStatus({
  discovery,
}: {
  discovery: Extract<NftHoldingsResult, { ok: true }>["discovery"];
}) {
  const selfIndexed = discovery.provider === "onchain-log-scan";

  if (discovery.state === "complete") {
    return (
      <p className="text-xs text-faint">
        {selfIndexed
          ? "Collections discovered by scanning this wallet's full transfer history onchain; every count re-read onchain."
          : `Collections discovered via ${discovery.provider}; every count re-read onchain.`}
      </p>
    );
  }

  if (discovery.state === "partial") {
    return (
      <div role="status" className="rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3">
        <p className="text-sm font-medium text-ink">Partial discovery</p>
        <p className="mt-1 text-sm text-muted">
          {selfIndexed ? (
            <>
              The transfer-history scan for{" "}
              {discovery.failedWallets.map((w) => shortenAddress(w)).join(", ")} reached its request
              limit before covering all history. That wallet has an unusually large number of NFT
              transfers, so older collections may be missing. Everything shown is verified onchain.
            </>
          ) : (
            <>
              {discovery.provider} did not respond for{" "}
              {discovery.failedWallets.map((w) => shortenAddress(w)).join(", ")}. Collections held
              only by {discovery.failedWallets.length === 1 ? "that wallet" : "those wallets"} may
              be missing. Counts shown are still verified onchain.
            </>
          )}
        </p>
      </div>
    );
  }

  // Unavailable — be specific about why, because "needs a paid plan" and
  // "temporarily down" call for very different actions.
  const needsPlan = discovery.reason === "tier-required";
  return (
    <div role="status" className="rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3">
      <p className="text-sm font-medium text-ink">
        {needsPlan
          ? "Automatic discovery requires a paid indexer plan"
          : discovery.reason === "no-key"
            ? "Automatic discovery is not configured"
            : "Automatic discovery is temporarily unavailable"}
      </p>
      <p className="mt-1 text-sm text-muted">
        {needsPlan
          ? "The indexer's Monad Mainnet account API is Pro-tier only. Known collections were still checked onchain, and you can check any collection manually below."
          : "Known collections were still checked onchain. You can also check any collection manually below."}
      </p>
    </div>
  );
}

function CollectionRow({
  collection,
  expanded,
  onToggle,
}: {
  collection: WireCollection;
  expanded: boolean;
  onToggle: () => void;
}) {
  const total = BigInt(collection.total);
  const panelId = `nft-${collection.contractAddress}`;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-raised"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={`text-faint transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ›
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink">
              {collection.name ?? "Unnamed collection"}
            </span>
            <span className="block font-mono text-[11px] text-faint">
              {shortenAddress(collection.contractAddress)}
              {!collection.isErc721 ? (
                <span className="ml-2 text-warn">not ERC-721 verified</span>
              ) : null}
              {collection.partial ? <span className="ml-2 text-danger">partial</span> : null}
            </span>
          </span>
        </span>

        <span className="tnum shrink-0 text-lg font-medium text-ink">
          {formatCount(total)}
          <span className="ml-1.5 text-xs font-normal text-faint">
            {pluralise(total, "NFT")}
          </span>
        </span>
      </button>

      {expanded ? (
        <div id={panelId} className="border-t border-line bg-raised px-4 py-3">
          <ul className="space-y-2">
            {collection.perWallet.map((w, i) => (
              <li key={w.wallet} className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-[4.5rem] shrink-0 text-xs text-faint">{walletLabel(i)}</span>
                  <AddressChip address={w.wallet} />
                </span>
                {w.count === null ? (
                  <span className="tnum text-sm text-danger" title={w.error}>
                    Failed
                  </span>
                ) : (
                  <span
                    className={`tnum text-sm ${BigInt(w.count) === 0n ? "text-faint" : "text-ink"}`}
                  >
                    {formatCount(BigInt(w.count))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-faint">
            Contract{" "}
            <span className="font-mono">{collection.contractAddress}</span>
            {collection.nameSource === "onchain"
              ? " · name read from the contract"
              : collection.nameSource === "indexer"
                ? " · name supplied by the indexer"
                : ""}
          </p>
        </div>
      ) : null}
    </li>
  );
}
