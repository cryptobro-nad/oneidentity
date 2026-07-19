"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH, PERSONAL_ID, type Portfolio } from "@/lib/portfolios/types";

/**
 * Portfolio selector and management.
 *
 * A `<select>` rather than a row of tabs: a user may accumulate many
 * portfolios, and tabs would either overflow a narrow screen or need
 * horizontal scrolling. A native select stays compact at any count, is
 * keyboard-usable for free, and handles long names without breaking layout.
 */
export function PortfolioSwitcher({
  portfolios,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  portfolios: Portfolio[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => { ok: boolean; message?: string };
  onRename: (id: string, name: string) => { ok: boolean; message?: string };
  onDelete: (id: string) => void;
}) {
  const selectId = useId();
  const nameInputId = useId();

  const [mode, setMode] = useState<"idle" | "create" | "rename" | "confirm-delete">("idle");
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const active = portfolios.find((p) => p.id === activeId) ?? portfolios[0]!;
  const isDefault = active.id === PERSONAL_ID;

  // Move focus into the form when it opens, so keyboard users are not left
  // behind on the trigger button.
  useEffect(() => {
    if (mode === "create" || mode === "rename") inputRef.current?.focus();
  }, [mode]);

  const close = useCallback(() => {
    setMode("idle");
    setDraftName("");
    setError(null);
    selectRef.current?.focus();
  }, []);

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const result =
        mode === "create" ? onCreate(draftName) : onRename(active.id, draftName);

      if (!result.ok) {
        setError(result.message ?? "That name could not be used.");
        return;
      }
      close();
    },
    [mode, draftName, onCreate, onRename, active.id, close],
  );

  return (
    <section aria-labelledby={`${selectId}-label`} className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label id={`${selectId}-label`} htmlFor={selectId} className="block text-xs text-faint">
            Portfolio
          </label>
          <select
            id={selectId}
            ref={selectRef}
            value={active.id}
            onChange={(e) => {
              setMode("idle");
              setError(null);
              onSelect(e.target.value);
            }}
            className="mt-1 w-full max-w-full truncate rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink"
          >
            {portfolios.map((p) => (
              // The full name stays in the option text, so assistive tech and
              // the native dropdown always expose it even when truncated.
              <option key={p.id} value={p.id}>
                {p.name}
                {p.addresses.length > 0 ? ` (${p.addresses.length})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("create");
              setDraftName("");
              setError(null);
            }}
            className="rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors hover:bg-raised"
          >
            New portfolio
          </button>

          {!isDefault ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode("rename");
                  setDraftName(active.name);
                  setError(null);
                }}
                className="rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors hover:bg-raised"
                aria-label={`Rename portfolio ${active.name}`}
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("confirm-delete");
                  setError(null);
                }}
                className="rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-muted transition-colors hover:bg-raised hover:text-danger"
                aria-label={`Delete portfolio ${active.name}`}
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Create / rename share one inline form — no modal for a single field. */}
      {mode === "create" || mode === "rename" ? (
        <form onSubmit={submit} noValidate className="mt-4 border-t border-line pt-4">
          <label htmlFor={nameInputId} className="block text-xs text-faint">
            {mode === "create" ? "Name for the new portfolio" : `New name for “${active.name}”`}
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id={nameInputId}
              ref={inputRef}
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
                if (error) setError(null);
              }}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${nameInputId}-error` : undefined}
              placeholder="Trading wallets"
              className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-faint"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
              >
                {mode === "create" ? "Create" : "Save name"}
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm text-muted transition-colors hover:bg-raised"
              >
                Cancel
              </button>
            </div>
          </div>
          {error ? (
            <p id={`${nameInputId}-error`} role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      {mode === "confirm-delete" ? (
        <div
          role="alertdialog"
          aria-labelledby={`${selectId}-delete-heading`}
          className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3.5"
        >
          <p id={`${selectId}-delete-heading`} className="text-sm font-medium text-ink">
            Delete “{active.name}”?
          </p>
          <p className="mt-1 text-sm text-muted">
            This removes the watchlist from this browser. It does not affect the wallets or any
            Verified ONE.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onDelete(active.id);
                close();
              }}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
            >
              Delete portfolio
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm text-ink transition-colors hover:bg-raised"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-faint">
        Portfolios are private watchlists saved in this browser. They do not prove wallet ownership
        and are not stored onchain. Clearing site data removes them, and they do not sync between
        devices or browsers. No wallet connection is needed.
      </p>
    </section>
  );
}
