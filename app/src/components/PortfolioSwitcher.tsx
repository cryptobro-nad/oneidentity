"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH, PERSONAL_ID, type Portfolio } from "@/lib/portfolios/types";

/**
 * Portfolio selector and management.
 *
 * A vertical list of rows rather than tabs or a dropdown. Tabs would overflow
 * or need horizontal scrolling once a user accumulates portfolios, and a
 * dropdown hides the wallet counts. Rows stack cleanly at any width and any
 * name length.
 *
 * Each row is a button (selects the portfolio) with Edit/Delete as SIBLING
 * buttons, never nested inside it — nesting interactive elements is invalid
 * HTML and would make a click on Edit also fire selection.
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
  const headingId = useId();
  const nameInputId = useId();

  const [mode, setMode] = useState<"idle" | "create" | "rename" | "confirm-delete">("idle");
  /** Which portfolio the rename/delete form is acting on. */
  const [targetId, setTargetId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const target = portfolios.find((p) => p.id === targetId) ?? null;

  useEffect(() => {
    if (mode === "create" || mode === "rename") inputRef.current?.focus();
  }, [mode]);

  const close = useCallback(() => {
    setMode("idle");
    setTargetId(null);
    setDraftName("");
    setError(null);
  }, []);

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const result = mode === "create" ? onCreate(draftName) : onRename(targetId ?? "", draftName);

      if (!result.ok) {
        setError(result.message ?? "That name could not be used.");
        return;
      }
      close();
    },
    [mode, draftName, onCreate, onRename, targetId, close],
  );

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-sm font-medium text-ink">
          Your portfolios
        </h2>
        <button
          type="button"
          onClick={() => {
            setMode("create");
            setTargetId(null);
            setDraftName("");
            setError(null);
          }}
          className="rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink transition-colors hover:bg-raised"
        >
          New portfolio
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {portfolios.map((p) => {
          const isActive = p.id === activeId;
          const isDefault = p.id === PERSONAL_ID;
          return (
            <li
              key={p.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 transition-colors ${
                isActive
                  ? "border-accent/50 bg-accent-soft"
                  : "border-line bg-canvas hover:bg-raised"
              }`}
            >
              {/* The row body selects. min-w-0 lets a long name truncate
                  instead of pushing the action buttons off a narrow screen. */}
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-current={isActive ? "true" : undefined}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex items-center gap-2">
                  <span className={`truncate text-sm ${isActive ? "text-ink" : "text-muted"}`}>
                    {p.name}
                  </span>
                  {isActive ? (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-ink">
                      Selected
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-faint">
                  {p.addresses.length} {p.addresses.length === 1 ? "wallet" : "wallets"}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode("rename");
                    setTargetId(p.id);
                    setDraftName(p.name);
                    setError(null);
                  }}
                  className="rounded-md px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
                  aria-label={`Rename ${p.name}`}
                >
                  Edit
                </button>
                {/* The default portfolio is renamable but permanent — it is
                    where deleting any other portfolio lands. */}
                {!isDefault ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("confirm-delete");
                      setTargetId(p.id);
                      setError(null);
                    }}
                    className="rounded-md px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-danger"
                    aria-label={`Delete ${p.name}`}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {mode === "create" || mode === "rename" ? (
        <form onSubmit={submit} noValidate className="mt-4 border-t border-line pt-4">
          <label htmlFor={nameInputId} className="block text-xs text-faint">
            {mode === "create"
              ? "Name for the new portfolio"
              : `New name for “${target?.name ?? ""}”`}
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

      {mode === "confirm-delete" && target ? (
        <div
          role="alertdialog"
          aria-labelledby={`${headingId}-delete`}
          className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3.5"
        >
          <p id={`${headingId}-delete`} className="text-sm font-medium text-ink">
            Delete “{target.name}”?
          </p>
          <p className="mt-1 text-sm text-muted">
            This removes the watchlist from this browser. It does not affect the wallets or any
            Verified ONE.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onDelete(target.id);
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
