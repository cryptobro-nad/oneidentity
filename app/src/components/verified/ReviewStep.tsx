"use client";

import { AddressChip } from "@/components/AddressChip";
import { ErrorNotice } from "@/components/Notices";
import { formatAmount, formatTimestamp, walletLabel } from "@/lib/format";
import type { DecodedError } from "@/lib/registry/errors";
import type { GasPlan } from "@/lib/registry/gas";
import type { PreflightIssue } from "@/lib/registry/create";
import type { PortfolioAddress } from "@/lib/types";

export function ErrorPanel({ error }: { error: DecodedError }) {
  return (
    <ErrorNotice title={error.title}>
      <p>{error.detail}</p>
      {error.action ? <p className="mt-2 text-ink">{error.action}</p> : null}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-faint hover:text-muted">
          Technical details
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-raised p-3 font-mono text-[11px] leading-relaxed text-muted">
          {error.name}
          {"\n"}
          {error.technical}
        </pre>
      </details>
    </ErrorNotice>
  );
}

function describeIssue(issue: PreflightIssue): string {
  switch (issue.kind) {
    case "no-primary":
      return "Select which wallet is the primary.";
    case "no-salt":
      return "The draft has no salt. Reload the page to start a fresh draft.";
    case "no-deadline":
      return "The draft has no signing deadline.";
    case "member-problem":
      return issue.detail;
    case "wrong-chain":
      return `Your wallet is on chain ${issue.connected ?? "unknown"}. Switch to Monad Mainnet (143).`;
    case "primary-not-connected":
      return `Connect the primary wallet ${issue.expected} to submit. Currently connected: ${issue.connected ?? "none"}.`;
    case "missing-signature":
      return `${issue.wallet} has not signed yet.`;
    case "stale-signature":
      return `${issue.wallet} signed an older configuration. It must sign again.`;
    case "expired-signature":
      return `${issue.wallet}'s signature expired. It must sign again.`;
    case "nonce-changed":
      return `${issue.wallet} signed with nonce ${issue.signed} but its nonce is now ${issue.current}. It must sign again.`;
    case "already-bound":
      return `${issue.wallet} already belongs to the active ONE at ${issue.one}.`;
    case "salt-used":
      return "This exact creation intent was already used. Start a new draft.";
    case "predicted-occupied":
      return `Something is already deployed at the predicted address ${issue.predicted}.`;
  }
}

export function ReviewStep({
  primary,
  sortedMembers,
  predictedAddress,
  deadline,
  gasPlan,
  bufferPercent,
  onBufferChange,
  issues,
  simulating,
  canSubmit,
  submitting,
  onSimulate,
  onSubmit,
  error,
}: {
  primary: PortfolioAddress | null;
  sortedMembers: PortfolioAddress[];
  predictedAddress: PortfolioAddress | null;
  deadline: string | null;
  gasPlan: GasPlan | null;
  bufferPercent: number;
  onBufferChange: (value: number) => void;
  issues: PreflightIssue[];
  simulating: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onSimulate: () => void;
  onSubmit: () => void;
  error: DecodedError | null;
}) {
  return (
    <section aria-labelledby="review-heading" className="space-y-5">
      <div>
        <h2 id="review-heading" className="text-lg font-medium text-ink">
          3. Review and create
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Everything below is re-read from the chain when you simulate, not taken from the draft.
        </p>
      </div>

      <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5">
        <p className="text-sm font-medium text-ink">Verified ONE is public.</p>
        <p className="mt-1 text-sm text-muted">
          The selected wallets and their relationship will be visible onchain. Membership is
          permanent in this identity&apos;s history: wallets can leave, but the record that they
          were once linked cannot be removed.
        </p>
      </div>

      <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <dt className="text-sm text-faint">Primary wallet</dt>
          <dd>{primary ? <AddressChip address={primary} /> : <span className="text-sm text-faint">—</span>}</dd>
        </div>

        <div className="px-4 py-3">
          <dt className="text-sm text-faint">Linked wallets (canonical order)</dt>
          <dd className="mt-2 space-y-1.5">
            {sortedMembers.map((m, i) => (
              <div key={m} className="flex items-center gap-3">
                <span className="w-[4.5rem] shrink-0 text-xs text-faint">{walletLabel(i)}</span>
                <AddressChip address={m} />
                {primary?.toLowerCase() === m.toLowerCase() ? (
                  <span className="text-xs text-accent">primary</span>
                ) : (
                  <span className="text-xs text-faint">secondary</span>
                )}
              </div>
            ))}
          </dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <dt className="text-sm text-faint">Predicted ONE address</dt>
          <dd>
            {predictedAddress ? (
              <AddressChip address={predictedAddress} />
            ) : (
              <span className="text-sm text-faint">Simulate to calculate</span>
            )}
          </dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <dt className="text-sm text-faint">Signatures expire</dt>
          <dd className="text-sm text-muted">
            {deadline ? formatTimestamp(Number(deadline) * 1000) : "—"}
          </dd>
        </div>
      </dl>

      {/* Gas: Monad bills the limit, so the buffer is a real cost, not free insurance. */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-medium text-ink">Gas</h3>
        <p className="mt-1 text-sm text-muted">
          Monad charges the submitted gas limit, not the gas actually used. A larger buffer is
          real money, not free insurance — but too small a limit means the transaction runs out of
          gas and you are still charged.
        </p>

        <label className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">Safety buffer</span>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={bufferPercent}
            onChange={(e) => onBufferChange(Number(e.target.value))}
            className="accent-[var(--accent)]"
          />
          <span className="tnum text-ink">{bufferPercent}%</span>
        </label>

        {gasPlan ? (
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="flex justify-between gap-3 rounded-lg bg-raised px-3 py-2">
              <dt className="text-xs text-faint">Estimated gas</dt>
              <dd className="tnum text-sm text-ink">{gasPlan.estimatedGas.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-raised px-3 py-2">
              <dt className="text-xs text-faint">Gas limit submitted</dt>
              <dd className="tnum text-sm text-ink">{gasPlan.gasLimit.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-raised px-3 py-2">
              <dt className="text-xs text-faint">Gas price</dt>
              <dd className="tnum text-sm text-ink">
                {formatAmount(gasPlan.gasPrice, 9, 2)} gwei
              </dd>
            </div>
            <div className="flex justify-between gap-3 rounded-lg bg-accent-soft px-3 py-2">
              <dt className="text-xs text-accent">Maximum cost</dt>
              <dd className="tnum text-sm font-medium text-ink">
                {formatAmount(gasPlan.maxCostWei, 18, 6)} MON
              </dd>
            </div>
            <div className="sm:col-span-2 text-xs text-faint">
              Of that, {formatAmount(gasPlan.bufferCostWei, 18, 6)} MON is the buffer. Without it
              the cost would be {formatAmount(gasPlan.costIfChargedOnUsageWei, 18, 6)} MON, but a
              transaction that runs out of gas is charged in full and creates nothing.
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-faint">Simulate to estimate gas.</p>
        )}
      </div>

      {issues.length > 0 ? (
        <div role="status" className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5">
          <p className="text-sm font-medium text-ink">Not ready to submit</p>
          <ul className="mt-2 space-y-1.5">
            {issues.map((issue, i) => (
              <li key={i} className="text-sm text-muted">
                {describeIssue(issue)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <ErrorPanel error={error} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSimulate}
          disabled={simulating || submitting}
          className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised disabled:opacity-50"
        >
          {simulating ? "Simulating…" : "Simulate transaction"}
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Waiting for confirmation…" : "Create Verified ONE"}
        </button>
      </div>
    </section>
  );
}
