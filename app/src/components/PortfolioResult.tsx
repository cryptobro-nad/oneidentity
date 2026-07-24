"use client";

import { useMemo, useState } from "react";
import {
  formatAmount,
  formatBlockNumber,
  formatTimestamp,
  shortenAddress,
  walletLabel,
} from "@/lib/format";
import {
  ALL_BALANCE_TOKENS,
  NATIVE_DECIMALS,
  NATIVE_SYMBOL,
  type BalanceToken,
} from "@/lib/tokens";
import { collectFailedReads, type AggregatedPortfolio, type AssetReadResult } from "@/lib/types";
import { PartialNotice } from "./Notices";
import { useHorizontalOverflow } from "./useHorizontalOverflow";

/**
 * One balance value. Three distinct states, never collapsed:
 *   success non-zero → the value
 *   success zero     → a muted "0"
 *   failure          → "Failed", in the danger colour, reason on hover
 */
function BalanceCell({
  result,
  decimals,
  maxFractionDigits = 2,
}: {
  result: AssetReadResult | undefined;
  decimals: number;
  maxFractionDigits?: number;
}) {
  if (!result || !result.success) {
    return (
      <span className="tnum text-sm text-danger" title={result?.error ?? "No result returned"}>
        Failed
      </span>
    );
  }
  const value = result.rawValue ?? 0n;
  const isZero = value === 0n;
  // A zero wallet balance still shows (ownership distribution matters) but is
  // clearly de-emphasised — smaller and muted, so the cue is not colour alone.
  return (
    <span
      className={`tnum ${isZero ? "text-[0.72rem] font-normal text-faint" : "text-sm text-ink"}`}
    >
      {formatAmount(value, decimals, maxFractionDigits)}
    </span>
  );
}

/** Token logo from the on-list metadata, degrading to a monogram tile. */
function TokenLogo({ token }: { token: BalanceToken }) {
  const [broken, setBroken] = useState(false);
  if (token.logoURI && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.logoURI}
        alt=""
        width={20}
        height={20}
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-5 w-5 shrink-0 rounded-full border border-line bg-surface object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-[0.55rem] text-ink-3"
    >
      {token.symbol.slice(0, 2)}
    </span>
  );
}

export function PortfolioResult({ portfolio }: { portfolio: AggregatedPortfolio }) {
  const failures = collectFailedReads(portfolio);
  const wallets = portfolio.wallets;
  const { ref: scrollRef, overflows } = useHorizontalOverflow<HTMLDivElement>();

  const symbolFailed = (symbol: string) => failures.some((f) => f.symbol === symbol);

  /**
   * Only HELD tokens appear. MON always shows. A token is included when its
   * combined balance is non-zero OR a read failed — a failed read is never
   * hidden, because presenting an RPC failure as "you hold none" is the one
   * confusion this codebase avoids.
   */
  const visibleTokens = useMemo(
    () =>
      ALL_BALANCE_TOKENS.filter(
        (t) => (portfolio.totals[t.symbol] ?? 0n) > 0n || symbolFailed(t.symbol),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio],
  );

  return (
    <section aria-labelledby="combined-heading" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h2 id="combined-heading" className="font-serif text-[1.6rem] leading-tight text-ink">
          Combined balances
        </h2>
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[0.72rem] text-ink-3">
          <div className="flex gap-1.5">
            <dt>Addresses</dt>
            <dd className="tnum text-ink-2">{wallets.length}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Block</dt>
            <dd className="tnum text-ink-2">{formatBlockNumber(portfolio.blockNumber)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Refreshed</dt>
            <dd className="text-ink-2">{formatTimestamp(portfolio.fetchedAt)}</dd>
          </div>
        </dl>
      </div>

      {portfolio.partial ? (
        <PartialNotice
          failures={failures.map((f) => ({
            label: `${shortenAddress(f.address)} · ${f.symbol}`,
            detail: f.error,
          }))}
        />
      ) : null}

      {portfolio.failedEndpoints.length > 0 ? (
        <p className="font-mono text-[0.72rem] text-warn">
          Primary RPC failed ({portfolio.failedEndpoints.map((f) => f.url).join(", ")}). Served from
          fallback {portfolio.endpointUsed}.
        </p>
      ) : null}

      {/* Token × wallet ownership matrix. One row per token contract; the
          Combined column equals the sum of the wallet columns. The Token column
          is sticky and the table scrolls horizontally so every wallet balance
          stays reachable on a narrow screen. */}
      {overflows ? (
        <p className="text-right font-mono text-[0.68rem] text-ink-3" aria-hidden>
          Scroll to see wallets →
        </p>
      ) : null}
      <div ref={scrollRef} className="overflow-x-auto rounded-[14px] border border-line">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="sr-only">
            Combined and per-wallet token balances. Each row is one token; each wallet has its own
            column.
          </caption>
          <thead>
            <tr className="border-b border-line bg-surface-2/40 text-left">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface-2 px-3.5 py-2.5 font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase"
              >
                Token
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-right font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase">
                Combined
              </th>
              {wallets.map((w, i) => (
                <th
                  key={w.address}
                  scope="col"
                  className="px-3.5 py-2.5 text-right font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase"
                >
                  <span className="block">{walletLabel(i)}</span>
                  <span className="block font-normal normal-case text-ink-3" title={w.address}>
                    {shortenAddress(w.address)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {/* Native MON — always shown, once. */}
            <tr className="bg-surface">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3.5 py-3 text-left font-normal">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-surface-2 font-mono text-[0.55rem] text-accent-deep"
                  >
                    M
                  </span>
                  <span className="font-medium text-ink">MON</span>
                  <span className="text-[0.72rem] text-ink-3">Monad</span>
                  {symbolFailed(NATIVE_SYMBOL) ? (
                    <span className="font-mono text-[0.6rem] text-warn" title="Some wallets could not be read">
                      incomplete
                    </span>
                  ) : null}
                </span>
              </th>
              <td className="px-3.5 py-3 text-right">
                <span className="tnum text-sm font-semibold text-ink">
                  {formatAmount(portfolio.totals[NATIVE_SYMBOL] ?? 0n, NATIVE_DECIMALS, 4)}
                </span>
              </td>
              {wallets.map((w) => (
                <td key={w.address} className="px-3.5 py-3 text-right">
                  <BalanceCell result={w.mon} decimals={NATIVE_DECIMALS} maxFractionDigits={4} />
                </td>
              ))}
            </tr>

            {visibleTokens.map((token) => (
              <tr key={token.address} className="bg-surface">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3.5 py-3 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <TokenLogo token={token} />
                    <span className="font-medium text-ink">{token.symbol}</span>
                    {token.name && token.name !== token.symbol ? (
                      <span className="max-w-[10rem] truncate text-[0.72rem] text-ink-3">
                        {token.name}
                      </span>
                    ) : null}
                    {symbolFailed(token.symbol) ? (
                      <span className="font-mono text-[0.6rem] text-warn" title="Some wallets could not be read">
                        incomplete
                      </span>
                    ) : null}
                  </span>
                </th>
                <td className="px-3.5 py-3 text-right">
                  <span className="tnum text-sm font-semibold text-ink">
                    {formatAmount(portfolio.totals[token.symbol] ?? 0n, token.decimals, 4)}
                  </span>
                </td>
                {wallets.map((w) => (
                  <td key={w.address} className="px-3.5 py-3 text-right">
                    <BalanceCell result={w.tokens[token.symbol]} decimals={token.decimals} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[0.78rem] leading-relaxed text-ink-3">
        Balances are verified onchain. Only held assets are shown.
      </p>
    </section>
  );
}
