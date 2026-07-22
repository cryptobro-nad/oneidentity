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
 * Renders one balance value.
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
    <span className={`tnum text-sm ${value === 0n ? "text-ink-3" : "text-ink"}`}>
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
      className={`relative rounded-[14px] border p-4 sm:p-5 ${
        emphasis ? "border-accent/40" : "border-line"
      }`}
      style={
        emphasis
          ? { background: "linear-gradient(160deg, var(--surface-2), var(--surface))" }
          : { background: "var(--surface)" }
      }
    >
      <div className="flex items-center gap-2">
        <p className="font-mono text-[0.7rem] tracking-[0.1em] text-ink-3 uppercase">{symbol}</p>
        {incomplete ? (
          <span className="font-mono text-[0.6rem] text-warn" title="Some wallets could not be read">
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
    <section aria-labelledby="combined-heading" className="space-y-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h2 id="combined-heading" className="font-serif text-[1.6rem] leading-tight text-ink">
          Combined balances
        </h2>
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[0.72rem] text-ink-3">
          <div className="flex gap-1.5">
            <dt>Addresses</dt>
            <dd className="tnum text-ink-2">{portfolio.wallets.length}</dd>
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
          className="rounded-[9px] border border-line-strong bg-surface px-3.5 py-2 font-mono text-[0.78rem] text-ink-2 transition-colors hover:border-accent hover:text-ink"
        >
          {showZero ? "Hide zero balances" : "Show zero balances"}
        </button>
        {!showZero && hiddenCount > 0 ? (
          <p className="text-[0.78rem] text-ink-3">
            {hiddenCount} asset{hiddenCount === 1 ? "" : "s"} with a zero balance hidden.
          </p>
        ) : null}
      </div>

      {heldMemes.length > 0 || showZero ? (
        <p className="text-[0.78rem] leading-relaxed text-ink-3">
          These supported memecoins use verified contract addresses. Inclusion is not an
          endorsement.
        </p>
      ) : null}

      <div>
        <h3 className="mb-4 font-serif text-[1.2rem] leading-tight text-ink">Per-wallet breakdown</h3>

        <div className="grid gap-3 lg:grid-cols-2">
          {portfolio.wallets.map((wallet, index) => (
            <div
              key={wallet.address}
              role="group"
              aria-label={`${walletLabel(index)} balances`}
              className="rounded-[14px] border border-line bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <span className="font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase">
                  {walletLabel(index)}
                </span>
                <AddressChip address={wallet.address} />
              </div>
              <dl className="mt-3.5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <dt className="font-mono text-[0.64rem] tracking-[0.08em] text-ink-3 uppercase">
                    {NATIVE_SYMBOL}
                  </dt>
                  <dd>
                    <BalanceCell result={wallet.mon} decimals={NATIVE_DECIMALS} />
                  </dd>
                </div>
                {visibleTokens.map((t) => (
                  <div key={t.symbol} className="flex flex-col gap-1">
                    <dt className="font-mono text-[0.64rem] tracking-[0.08em] text-ink-3 uppercase">
                      {t.symbol}
                    </dt>
                    <dd>
                      <BalanceCell
                        result={wallet.tokens[t.symbol]}
                        decimals={t.decimals}
                        maxFractionDigits={2}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
