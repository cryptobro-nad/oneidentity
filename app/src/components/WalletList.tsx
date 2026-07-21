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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="wallets-heading" className="min-w-0 truncate text-lg font-medium text-ink">
          {heading}
        </h2>
        <p className="text-sm text-faint">
          {addresses.length} of {MAX_WALLETS} added
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-2">
        <label htmlFor={inputId} className="block text-xs text-faint">
          Add wallet address
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
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
            className="min-w-0 flex-1 rounded-[8px] border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={full}
            className="rounded-[8px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add wallet
          </button>
        </div>

        {error ? (
          <p id="wallet-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {full && !error ? (
          <p className="text-sm text-faint">
            You have reached the {MAX_WALLETS}-wallet limit. Remove one to add another.
          </p>
        ) : null}
      </form>

      {addresses.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
          {addresses.map((address, index) => (
            <li
              key={address}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-[4.5rem] shrink-0 text-xs text-faint">{walletLabel(index)}</span>
                <AddressChip address={address} />
              </div>
              <button
                type="button"
                onClick={() => onRemove(address)}
                className="text-xs text-faint transition-colors hover:text-danger"
                aria-label={`Remove ${address}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-sm text-faint">
          Add a Monad Mainnet address to begin.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onLoad}
          disabled={addresses.length === 0 || loading}
          className="rounded-[8px] bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Loading…" : loadLabel}
        </button>
        {addresses.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-muted transition-colors hover:text-danger"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </section>
  );
}
