"use client";

import {
  formatAmount,
  formatBlockNumber,
  formatTimestamp,
  shortenAddress,
  walletLabel,
} from "@/lib/format";
import { NATIVE_DECIMALS, NATIVE_SYMBOL, SUPPORTED_STABLECOINS } from "@/lib/tokens";
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
      <span
        className="tnum text-sm text-danger"
        title={result?.error ?? "No result returned"}
      >
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
    <div className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5 sm:py-5">
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
  const failures = collectFailedReads(portfolio);

  // A token is "incomplete" when at least one wallet's read for it failed.
  const symbolFailed = (symbol: string) => failures.some((f) => f.symbol === symbol);

  return (
    <section aria-labelledby="combined-heading" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="combined-heading" className="text-lg font-medium text-ink">
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
          Primary RPC failed ({portfolio.failedEndpoints.map((f) => f.url).join(", ")}). Served
          from fallback {portfolio.endpointUsed}.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TotalCard
          symbol={NATIVE_SYMBOL}
          raw={portfolio.totals[NATIVE_SYMBOL] ?? 0n}
          decimals={NATIVE_DECIMALS}
          incomplete={symbolFailed(NATIVE_SYMBOL)}
          emphasis
        />
        {SUPPORTED_STABLECOINS.map((token) => (
          <TotalCard
            key={token.symbol}
            symbol={token.symbol}
            raw={portfolio.totals[token.symbol] ?? 0n}
            decimals={token.decimals}
            incomplete={symbolFailed(token.symbol)}
          />
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-ink">Per-wallet breakdown</h3>

        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[38rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-3 text-xs font-medium text-faint">
                  Wallet
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-faint">
                  {NATIVE_SYMBOL}
                </th>
                {SUPPORTED_STABLECOINS.map((t) => (
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
                  {SUPPORTED_STABLECOINS.map((t) => (
                    <td key={t.symbol} className="px-4 py-3 text-right">
                      <BalanceCell
                        result={wallet.stablecoins[t.symbol]}
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
