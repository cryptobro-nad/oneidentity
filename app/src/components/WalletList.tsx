"use client";

import { useId, useState, type FormEvent } from "react";
import { validateNewAddress } from "@/lib/addresses";
import { MAX_WALLETS } from "@/lib/chain";
import { walletLabel } from "@/lib/format";
import type { PortfolioAddress } from "@/lib/types";
import { AddressChip } from "./AddressChip";

export function WalletList({
  addresses,
  onAdd,
  onRemove,
  onClear,
  onLoad,
  loading,
  heading = "Wallets",
  loadLabel = "Load portfolio",
}: {
  addresses: PortfolioAddress[];
  onAdd: (address: PortfolioAddress) => void;
  onRemove: (address: PortfolioAddress) => void;
  onClear: () => void;
  onLoad: () => void;
  loading: boolean;
  /** Varies with state: load / load saved / refresh. */
  loadLabel?: string;
  /** Section heading; names the active portfolio. */
  heading?: string;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const full = addresses.length >= MAX_WALLETS;

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateNewAddress(draft, addresses);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onAdd(result.address);
    setDraft("");
    setError(null);
  }

  return (
    <section aria-labelledby="wallets-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="wallets-heading"
          className="min-w-0 truncate font-serif text-[1.35rem] leading-tight text-ink"
        >
          {heading}
        </h2>
        <span className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-[0.72rem] font-medium tabular-nums text-ink-2">
          {addresses.length} of {MAX_WALLETS} added
        </span>
      </div>

      <form onSubmit={submit} noValidate className="space-y-2">
        <label htmlFor={inputId} className="eyebrow block">
          Add wallet address
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id={inputId}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="0x… wallet address"
            spellCheck={false}
            autoComplete="off"
            disabled={full}
            aria-label="Add wallet address"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "wallet-error" : undefined}
            className="min-w-0 flex-1 rounded-[11px] border border-line-strong bg-bg px-4 py-3 font-mono text-sm text-ink transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--glow)] disabled:opacity-50"
          />
          <button type="submit" disabled={full} className="btn btn-ghost shrink-0 justify-center">
            Add wallet
          </button>
        </div>

        {error ? (
          <p id="wallet-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {full && !error ? (
          <p className="text-sm text-ink-3">
            You have reached the {MAX_WALLETS}-wallet limit. Remove one to add another.
          </p>
        ) : null}
      </form>

      {addresses.length > 0 ? (
        <ul className="space-y-2">
          {addresses.map((address, index) => (
            <li
              key={address}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-surface-2/50 px-3.5 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 rounded-[6px] border border-line-strong px-2 py-1 font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase">
                  {walletLabel(index)}
                </span>
                <AddressChip address={address} />
              </div>
              <button
                type="button"
                onClick={() => onRemove(address)}
                className="rounded-[7px] px-2 py-1 font-mono text-[0.72rem] text-ink-3 transition-colors hover:text-danger"
                aria-label={`Remove ${address}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line py-5 text-center text-sm text-ink-3">
          Add a Monad Mainnet address to begin.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onLoad}
          disabled={addresses.length === 0 || loading}
          className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Loading…" : loadLabel}
        </button>
        {addresses.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="font-mono text-[0.78rem] text-ink-2 transition-colors hover:text-danger"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </section>
  );
}
