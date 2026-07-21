"use client";

import { useState, type FormEvent } from "react";
import { AddressChip } from "@/components/AddressChip";
import { shortenAddress, walletLabel } from "@/lib/format";
import { MAX_MEMBERS, MIN_MEMBERS, sortMembers, validateMemberAddress } from "@/lib/registry/members";
import type { MemberChainState } from "@/app/verified/actions";
import type { PortfolioAddress } from "@/lib/types";

const ZERO = "0x0000000000000000000000000000000000000000";

export function SetupStep({
  members,
  primary,
  chainState,
  checking,
  onAdd,
  onRemove,
  onSelectPrimary,
  onRefresh,
  locked,
}: {
  members: PortfolioAddress[];
  primary: PortfolioAddress | null;
  chainState: MemberChainState[];
  checking: boolean;
  onAdd: (a: PortfolioAddress) => void;
  onRemove: (a: PortfolioAddress) => void;
  onSelectPrimary: (a: PortfolioAddress) => void;
  onRefresh: () => void;
  locked: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sorted = sortMembers(members);
  const full = members.length >= MAX_MEMBERS;

  const stateFor = (address: PortfolioAddress) =>
    chainState.find((s) => s.address.toLowerCase() === address.toLowerCase());

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateMemberAddress(draft, members);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onAdd(result.address);
    setDraft("");
    setError(null);
  }

  return (
    <section aria-labelledby="setup-heading" className="space-y-5">
      <div>
        <h2 id="setup-heading" className="text-lg font-semibold tracking-[-0.01em] text-ink">
          1. Choose wallets
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Add {MIN_MEMBERS} to {MAX_MEMBERS} wallets. Pick one as the primary wallet, which submits
          the transaction. The others sign to join.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            disabled={full || locked}
            aria-label="Wallet address"
            className="min-w-0 flex-1 rounded-[8px] border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={full || locked}
            className="rounded-[8px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add wallet
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {locked ? (
          <p className="text-sm text-warn">
            Signing has started. Changing the wallet list will invalidate the signatures already
            collected.
          </p>
        ) : null}
      </form>

      {members.length > 0 ? (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
            {sorted.map((address, index) => {
              const state = stateFor(address);
              const bound = state && state.activeOne !== ZERO;
              const isPrimary = primary?.toLowerCase() === address.toLowerCase();

              return (
                <li key={address} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-[4.5rem] shrink-0 text-xs text-faint">
                    {walletLabel(index)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <AddressChip address={address} />
                    {bound ? (
                      <p className="mt-1 text-xs text-danger">
                        Already in an active ONE ({shortenAddress(state!.activeOne)}). Remove it or
                        leave that ONE first.
                      </p>
                    ) : state ? (
                      <p className="mt-1 text-xs text-faint">
                        Unbound · nonce {state.nonce}
                      </p>
                    ) : null}
                  </div>

                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input
                      type="radio"
                      name="primary"
                      checked={isPrimary}
                      onChange={() => onSelectPrimary(address)}
                      className="accent-[var(--accent)]"
                    />
                    Primary
                  </label>

                  <button
                    type="button"
                    onClick={() => onRemove(address)}
                    className="text-xs text-faint transition-colors hover:text-danger"
                    aria-label={`Remove ${address}`}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-faint">
              Canonical order shown above is the ascending order the registry requires. Your entry
              order is not used.
            </p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={checking}
              className="text-xs text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              {checking ? "Checking…" : "Re-check onchain state"}
            </button>
          </div>
        </>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-sm text-faint">
          Add the wallets you want to link.
        </p>
      )}
    </section>
  );
}
