"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ErrorNotice } from "@/components/Notices";
import { formatCount, shortenAddress, walletLabel } from "@/lib/format";
import { isLikelyNftSpam } from "@/lib/nftSpam";
import { loadNftHoldingsAction, type NftHoldingsResult, type WireCollection } from "@/app/nft-actions";
import type { PortfolioAddress } from "@/lib/types";
import { useHorizontalOverflow } from "./useHorizontalOverflow";

const NFT_INITIAL = 12;

/**
 * Automatic NFT holdings, as a collection × wallet ownership table.
 *
 * Candidate collections come from an indexer/log-scan; every count on screen is
 * an on-chain `balanceOf` re-read through Multicall3. No images are fetched and
 * no token IDs are inferred — only what the chain confirms is shown. The
 * combined count equals the sum of the wallet columns. Collections whose name
 * carries a lure signal are routed to a collapsed "Likely spam" section.
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
  const [showSpam, setShowSpam] = useState(false);

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

  // Held = a verified non-zero total, or a partial (failed) read we must not
  // hide as zero. Then split by lure signal.
  const { held, spam } = useMemo(() => {
    const cols = result?.ok ? result.collections : [];
    const visible = cols.filter((c) => BigInt(c.total) > 0n || c.partial);
    // Sort by combined count, largest first.
    const byCountDesc = (a: WireCollection, b: WireCollection) => {
      const [ta, tb] = [BigInt(a.total), BigInt(b.total)];
      return tb > ta ? 1 : tb < ta ? -1 : 0;
    };
    return {
      held: visible.filter((c) => !isLikelyNftSpam(c.name)).sort(byCountDesc),
      spam: visible.filter((c) => isLikelyNftSpam(c.name)).sort(byCountDesc),
    };
  }, [result]);

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
                Cells marked <span className="text-danger">Failed</span> could not be read from the
                chain. They are excluded from the combined count rather than counted as zero, so
                totals are a lower bound.
              </p>
            </div>
          ) : null}

          {held.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-line-strong px-4 py-10 text-center text-sm text-faint">
              {result.discovery.state === "complete"
                ? "No NFT collections with a verified holding for these wallets."
                : "No collections found. Automatic discovery is unavailable, so only known collections were checked."}
            </p>
          ) : (
            <NftMatrix collections={held} wallets={addresses} />
          )}

          {spam.length > 0 ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowSpam((v) => !v)}
                aria-expanded={showSpam}
                className="font-mono text-[0.72rem] tracking-[0.06em] text-ink-3 uppercase transition-colors hover:text-ink"
              >
                {showSpam ? "Hide" : "Show"} likely spam ({spam.length})
              </button>
              <p className="mt-1 max-w-[64ch] text-[0.76rem] text-faint">
                Flagged only because the collection name contains a URL, domain, or a
                claim/airdrop-style lure — never for being unknown or missing metadata. No images or
                metadata links are loaded.
              </p>
              {showSpam ? (
                <div className="mt-3 opacity-90">
                  <NftMatrix collections={spam} wallets={addresses} spam />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** The collection × wallet ownership matrix. */
function NftMatrix({
  collections,
  wallets,
  spam = false,
}: {
  collections: WireCollection[];
  wallets: PortfolioAddress[];
  spam?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(NFT_INITIAL);
  const { ref: scrollRef, overflows } = useHorizontalOverflow<HTMLDivElement>();
  const toggle = useCallback((address: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  }, []);

  const shown = collections.slice(0, visible);
  const remaining = collections.length - visible;

  return (
    <div className="space-y-2">
      {overflows ? (
        <p className="text-right font-mono text-[0.68rem] text-ink-3" aria-hidden>
          Scroll to see wallets →
        </p>
      ) : null}
      <div ref={scrollRef} className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="sr-only">
          Combined and per-wallet NFT counts. Each row is one collection; each wallet has its own
          column.
        </caption>
        <thead>
          <tr className="border-b border-line bg-surface-2/40 text-left">
            <th scope="col" className="sticky left-0 z-10 bg-surface-2 px-3.5 py-2.5 font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase">
              Collection
            </th>
            <th scope="col" className="px-3.5 py-2.5 text-right font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase">
              Combined
            </th>
            {wallets.map((w, i) => (
              <th key={w} scope="col" className="px-3.5 py-2.5 text-right font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase">
                <span className="block">{walletLabel(i)}</span>
                <span className="block font-normal normal-case text-ink-3" title={w}>
                  {shortenAddress(w)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((c) => {
            const total = BigInt(c.total);
            const isOpen = expanded.has(c.contractAddress);
            const byWallet = new Map(c.perWallet.map((w) => [w.wallet.toLowerCase(), w]));
            const panelId = `nft-detail-${c.contractAddress}`;
            return (
              <Fragment key={c.contractAddress}>
                <tr className="bg-surface">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3.5 py-3 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => toggle(c.contractAddress)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className="flex min-w-0 items-center gap-2 text-left transition-colors hover:text-ink"
                    >
                      <span aria-hidden className={`text-faint transition-transform ${isOpen ? "rotate-90" : ""}`}>
                        ›
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {c.name ?? `Collection ${shortenAddress(c.contractAddress)}`}
                        </span>
                        <span className="block font-mono text-[0.64rem] text-faint">
                          {shortenAddress(c.contractAddress)}
                          {!c.isErc721 ? <span className="ml-1.5 text-warn">not ERC-721</span> : null}
                        </span>
                      </span>
                    </button>
                  </th>
                  <td className="px-3.5 py-3 text-right">
                    <span className="tnum text-sm font-semibold text-ink">{formatCount(total)}</span>
                  </td>
                  {wallets.map((w) => {
                    const entry = byWallet.get(w.toLowerCase());
                    return (
                      <td key={w} className="px-3.5 py-3 text-right">
                        {!entry || entry.count === null ? (
                          <span className="tnum text-sm text-danger" title={entry?.error ?? "No result"}>
                            {entry ? "Failed" : "—"}
                          </span>
                        ) : (
                          <span
                            className={`tnum ${BigInt(entry.count) === 0n ? "text-[0.72rem] text-faint" : "text-sm text-ink"}`}
                          >
                            {formatCount(BigInt(entry.count))}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {isOpen ? (
                  <tr>
                    <td colSpan={2 + wallets.length} id={panelId} className="border-t border-line bg-raised px-3.5 py-3">
                      <p className="text-[0.72rem] text-faint">
                        Contract{" "}
                        {spam ? (
                          <span className="font-mono text-ink-3">{c.contractAddress}</span>
                        ) : (
                          <a
                            href={`https://monadscan.com/token/${c.contractAddress}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="font-mono text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-accent"
                          >
                            {c.contractAddress}
                          </a>
                        )}
                        {c.nameSource === "onchain"
                          ? " · name read from the contract"
                          : c.nameSource === "indexer"
                            ? " · name supplied by the indexer"
                            : ""}
                        . Token IDs are not enumerated by the count-based check; every number above is
                        a verified on-chain balance.
                      </p>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>

      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setVisible((v) => v + NFT_INITIAL)}
          className="font-mono text-[0.72rem] text-ink-2 transition-colors hover:text-ink"
        >
          Show more ({remaining} more)
        </button>
      ) : collections.length > NFT_INITIAL ? (
        <button
          type="button"
          onClick={() => setVisible(NFT_INITIAL)}
          className="font-mono text-[0.72rem] text-ink-3 transition-colors hover:text-ink"
        >
          Show fewer
        </button>
      ) : null}
    </div>
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
              limit before covering all history. Older collections may be missing. Everything shown is
              verified onchain.
            </>
          ) : (
            <>
              {discovery.provider} did not respond for{" "}
              {discovery.failedWallets.map((w) => shortenAddress(w)).join(", ")}. Collections held
              only by {discovery.failedWallets.length === 1 ? "that wallet" : "those wallets"} may be
              missing. Counts shown are still verified onchain.
            </>
          )}
        </p>
      </div>
    );
  }

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
