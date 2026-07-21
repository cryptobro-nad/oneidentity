"use client";

import { useMemo, useState } from "react";
import {
  formatAmount,
  formatBlockNumber,
  formatTimestamp,
  shortenAddress,
  walletLabel,
} from "@/lib/format";
import { ALL_BALANCE_TOKENS, NATIVE_DECIMALS, NATIVE_SYMBOL, isMemeSymbol } from "@/lib/tokens";
import { collectFailedReads, type AggregatedPortfolio, type AssetReadResult } from "@/lib/types";
import { AddressChip } from "./AddressChip";
import { PartialNotice } from "./Notices";

/**
 * Renders one balance cell.
 *
 * Three visually distinct states, never collapsed into each other:
 *   success non-zero → the value
 *   success zero     → a muted "0"
 *   failure          → "Failed", in the danger colour, with the reason on hover
 */
function BalanceCell({
  result,
  decimals,
  maxFractionDigits = 4,
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
  return (
    <span className={`tnum text-sm ${value === 0n ? "text-faint" : "text-ink"}`}>
      {formatAmount(value, decimals, maxFractionDigits)}
    </span>
  );
}

function TotalCard({
  symbol,
  raw,
  decimals,
  incomplete,
  emphasis = false,
}: {
  symbol: string;
  raw: bigint;
  decimals: number;
  incomplete: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] border bg-surface px-4 py-4 shadow-[var(--shadow-card)] sm:px-5 sm:py-5 ${
        emphasis ? "border-line border-l-2 border-l-accent" : "border-line"
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs tracking-wide text-faint uppercase">{symbol}</p>
        {incomplete ? (
          <span className="text-[10px] text-warn" title="Some wallets could not be read">
            incomplete
          </span>
        ) : null}
      </div>
      <p
        className={`tnum mt-2 font-semibold tracking-[-0.03em] text-ink ${
          emphasis ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
        }`}
      >
        {formatAmount(raw, decimals, emphasis ? 4 : 2)}
      </p>
    </div>
  );
}

export function PortfolioResult({ portfolio }: { portfolio: AggregatedPortfolio }) {
  const [showZero, setShowZero] = useState(false);
  const failures = collectFailedReads(portfolio);

  // A token is "incomplete" when at least one wallet's read for it failed.
  const symbolFailed = (symbol: string) => failures.some((f) => f.symbol === symbol);

  /**
   * Which ERC-20 columns to render.
   *
   * MON is handled separately and always shows. Everything else — stablecoins
   * and community tokens alike — is hidden at zero, because a wallet holding
   * none of thirteen assets would otherwise be a wall of zeroes that also
   * overflows a phone.
   *
   * A token whose read FAILED is never hidden. Hiding it would present an RPC
   * failure as "you don't hold this", which is the one confusion this whole
   * codebase is built to avoid.
   */
  const visibleTokens = useMemo(() => {
    if (showZero) return ALL_BALANCE_TOKENS;
    return ALL_BALANCE_TOKENS.filter(
      (t) => (portfolio.totals[t.symbol] ?? 0n) > 0n || symbolFailed(t.symbol),
    );
    // symbolFailed derives from `failures`, which derives from `portfolio`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, showZero]);

  const hiddenCount = ALL_BALANCE_TOKENS.length - visibleTokens.length;
  const heldMemes = visibleTokens.filter((t) => isMemeSymbol(t.symbol));

  return (
    <section aria-labelledby="combined-heading" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="combined-heading" className="text-xl font-semibold tracking-[-0.01em] text-ink">
          Combined balances
        </h2>
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-faint">
          <div className="flex gap-1.5">
            <dt>Addresses</dt>
            <dd className="tnum text-muted">{portfolio.wallets.length}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Block</dt>
            <dd className="tnum text-muted">{formatBlockNumber(portfolio.blockNumber)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Refreshed</dt>
            <dd className="text-muted">{formatTimestamp(portfolio.fetchedAt)}</dd>
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
        <p className="text-xs text-warn">
          Primary RPC failed ({portfolio.failedEndpoints.map((f) => f.url).join(", ")}). Served from
          fallback {portfolio.endpointUsed}.
        </p>
      ) : null}

      <div
        role="group"
        aria-label="Combined totals"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <TotalCard
          symbol={NATIVE_SYMBOL}
          raw={portfolio.totals[NATIVE_SYMBOL] ?? 0n}
          decimals={NATIVE_DECIMALS}
          incomplete={symbolFailed(NATIVE_SYMBOL)}
          emphasis
        />
        {visibleTokens.map((token) => (
          <TotalCard
            key={token.symbol}
            symbol={token.symbol}
            raw={portfolio.totals[token.symbol] ?? 0n}
            decimals={token.decimals}
            incomplete={symbolFailed(token.symbol)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setShowZero((v) => !v)}
          aria-pressed={showZero}
          className="rounded-[8px] border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink transition-colors hover:bg-raised"
        >
          {showZero ? "Hide zero balances" : "Show zero balances"}
        </button>
        {!showZero && hiddenCount > 0 ? (
          <p className="text-xs text-faint">
            {hiddenCount} asset{hiddenCount === 1 ? "" : "s"} with a zero balance hidden.
          </p>
        ) : null}
      </div>

      {heldMemes.length > 0 || showZero ? (
        <p className="text-xs leading-relaxed text-faint">
          These supported memecoins use verified contract addresses. Inclusion is not an
          endorsement.
        </p>
      ) : null}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Per-wallet breakdown</h3>

        <div className="overflow-x-auto rounded-[12px] border border-line bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[38rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 text-xs font-medium text-faint">
                  Wallet
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-faint">
                  {NATIVE_SYMBOL}
                </th>
                {visibleTokens.map((t) => (
                  <th
                    key={t.symbol}
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-medium text-faint"
                  >
                    {t.symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {portfolio.wallets.map((wallet, index) => (
                <tr key={wallet.address}>
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="block text-xs text-faint">{walletLabel(index)}</span>
                    <AddressChip address={wallet.address} />
                  </th>
                  <td className="px-4 py-3 text-right">
                    <BalanceCell result={wallet.mon} decimals={NATIVE_DECIMALS} />
                  </td>
                  {visibleTokens.map((t) => (
                    <td key={t.symbol} className="px-4 py-3 text-right">
                      <BalanceCell
                        result={wallet.tokens[t.symbol]}
                        decimals={t.decimals}
                        maxFractionDigits={2}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
