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
        <span className="eyebrow">Step 1</span>
        <h2 id="setup-heading" className="mt-2 font-serif text-[1.5rem] leading-tight text-ink">
          Choose wallets
        </h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">
          Add {MIN_MEMBERS} to {MAX_MEMBERS} wallets. Pick one as the primary wallet, which submits
          the transaction. The others sign to join.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-2">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="0x… wallet address"
            spellCheck={false}
            autoComplete="off"
            disabled={full || locked}
            aria-label="Wallet address"
            className="min-w-0 flex-1 rounded-[11px] border border-line-strong bg-bg px-4 py-3 font-mono text-sm text-ink transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--glow)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={full || locked}
            className="btn btn-ghost shrink-0 justify-center disabled:cursor-not-allowed disabled:opacity-50"
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
          <ul className="space-y-2">
            {sorted.map((address, index) => {
              const state = stateFor(address);
              const bound = state && state.activeOne !== ZERO;
              const isPrimary = primary?.toLowerCase() === address.toLowerCase();

              return (
                <li
                  key={address}
                  className={
                    "flex flex-wrap items-center gap-3 rounded-[12px] border px-4 py-3 transition-colors " +
                    (isPrimary
                      ? "border-accent/45 bg-surface-2 shadow-[inset_2px_0_0_0_var(--accent)]"
                      : "border-line bg-surface")
                  }
                >
                  <span className="shrink-0 rounded-[6px] border border-line-strong px-2 py-1 font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase">
                    {walletLabel(index)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <AddressChip address={address} />
                      {primary ? (
                        isPrimary ? (
                          <span className="rounded-[5px] border border-accent px-2 py-[3px] font-mono text-[0.6rem] tracking-[0.1em] text-accent-deep">
                            PRIMARY
                          </span>
                        ) : (
                          <span className="rounded-[5px] border border-line-strong px-2 py-[3px] font-mono text-[0.6rem] tracking-[0.1em] text-ink-3">
                            SECONDARY
                          </span>
                        )
                      ) : null}
                    </div>
                    {bound ? (
                      <p className="mt-1 font-mono text-[0.72rem] text-danger">
                        Already in an active ONE ({shortenAddress(state!.activeOne)}). Remove it or
                        leave that ONE first.
                      </p>
                    ) : state ? (
                      <p className="mt-1 font-mono text-[0.72rem] text-ink-3">Unbound · nonce {state.nonce}</p>
                    ) : null}
                  </div>

                  <label className="flex items-center gap-1.5 font-mono text-[0.72rem] text-ink-2">
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
                    className="rounded-[7px] px-2 py-1 font-mono text-[0.72rem] text-ink-3 transition-colors hover:text-danger"
                    aria-label={`Remove ${address}`}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-[0.75rem] leading-relaxed text-ink-3">
              Canonical order shown above is the ascending order the registry requires. Your entry
              order is not used.
            </p>
            <button
              type="button"
              onClick={onRefresh}
              disabled={checking}
              className="font-mono text-[0.72rem] text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
            >
              {checking ? "Checking…" : "Re-check onchain state"}
            </button>
          </div>
        </>
      ) : (
        <p className="py-4 text-center text-sm text-faint">Add the wallets you want to link.</p>
      )}
    </section>
  );
}
