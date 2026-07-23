"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  DEFAULT_PORTFOLIO_COLOR,
  MAX_NAME_LENGTH,
  normalizePortfolioColor,
  PERSONAL_ID,
  PORTFOLIO_COLORS,
  type Portfolio,
  type PortfolioColor,
} from "@/lib/portfolios/types";
import { Badge } from "./ui/Badge";

/** Curated accents. Mid-tones chosen to read on both the dark and light ground. */
const COLOR_HEX: Record<PortfolioColor, string> = {
  green: "#3fc792",
  violet: "#8b7cf6",
  blue: "#5b9df6",
  amber: "#e0a44d",
  rose: "#e5789b",
  teal: "#37b6c7",
};
const COLOR_LABEL: Record<PortfolioColor, string> = {
  green: "Green",
  violet: "Violet",
  blue: "Blue",
  amber: "Amber",
  rose: "Rose",
  teal: "Teal",
};

/** Accessible swatch group. A fixed palette, never a free-form colour input. */
function ColorPalette({
  value,
  onChange,
}: {
  value: PortfolioColor;
  onChange: (color: PortfolioColor) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Portfolio color" className="flex flex-wrap gap-2">
      {PORTFOLIO_COLORS.map((c) => {
        const selected = c === value;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={COLOR_LABEL[c]}
            onClick={() => onChange(c)}
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-105"
            style={{ borderColor: selected ? COLOR_HEX[c] : "transparent" }}
          >
            <span className="h-[15px] w-[15px] rounded-full" style={{ background: COLOR_HEX[c] }} />
            {selected ? <span className="sr-only"> (selected)</span> : null}
          </button>
        );
      })}
    </div>
  );
}

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
  onColorChange,
}: {
  portfolios: Portfolio[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => { ok: boolean; message?: string; id?: string };
  onRename: (id: string, name: string) => { ok: boolean; message?: string };
  onDelete: (id: string) => void;
  /** Sets a portfolio's curated accent colour. Optional so other call sites and
   *  tests that do not use colour keep working unchanged. */
  onColorChange?: (id: string, color: PortfolioColor) => void;
}) {
  const headingId = useId();
  const nameInputId = useId();

  const [mode, setMode] = useState<"idle" | "create" | "rename" | "confirm-delete">("idle");
  /** Which portfolio the rename/delete form is acting on. */
  const [targetId, setTargetId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<PortfolioColor>(DEFAULT_PORTFOLIO_COLOR);
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
    setDraftColor(DEFAULT_PORTFOLIO_COLOR);
    setError(null);
  }, []);

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();

      if (mode === "create") {
        const result = onCreate(draftName);
        if (!result.ok) {
          setError(result.message ?? "That name could not be used.");
          return;
        }
        // Colour is applied after creation via the returned id, so onCreate's
        // signature stays name-only.
        if (result.id) onColorChange?.(result.id, draftColor);
      } else {
        const result = onRename(targetId ?? "", draftName);
        if (!result.ok) {
          setError(result.message ?? "That name could not be used.");
          return;
        }
        if (targetId) onColorChange?.(targetId, draftColor);
      }
      close();
    },
    [mode, draftName, draftColor, onCreate, onRename, onColorChange, targetId, close],
  );

  return (
    <section aria-labelledby={headingId} className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="font-serif text-[1.2rem] leading-tight text-ink">
          Your portfolios
        </h2>
        <button
          type="button"
          onClick={() => {
            setMode("create");
            setTargetId(null);
            setDraftName("");
            setDraftColor(DEFAULT_PORTFOLIO_COLOR);
            setError(null);
          }}
          className="rounded-[9px] border border-line-strong bg-surface px-3.5 py-2 font-mono text-[0.78rem] text-ink-2 transition-colors hover:border-accent hover:text-ink"
        >
          New portfolio
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {portfolios.map((p) => {
          const isActive = p.id === activeId;
          const isDefault = p.id === PERSONAL_ID;
          const color = normalizePortfolioColor(p.color);
          const hex = COLOR_HEX[color];
          return (
            <li
              key={p.id}
              data-portfolio-color={color}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border px-3.5 py-3 transition-colors ${
                isActive
                  ? "border-line-strong bg-surface-2"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/60"
              }`}
              // Colour is a restrained accent: a stronger left inset for the
              // active row, a faint one otherwise — never a full colour block.
              style={{ boxShadow: `inset ${isActive ? 3 : 2}px 0 0 0 ${hex}` }}
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
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: hex }}
                  />
                  <span
                    className={`truncate text-sm font-medium ${isActive ? "text-ink" : "text-muted"}`}
                  >
                    {p.name}
                  </span>
                  {isActive ? (
                    <span className="shrink-0">
                      <Badge tone="accent">Selected</Badge>
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block font-mono text-[0.72rem] tabular-nums text-ink-3">
                  {p.addresses.length} {p.addresses.length === 1 ? "wallet" : "wallets"}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("rename");
                    setTargetId(p.id);
                    setDraftName(p.name);
                    setDraftColor(normalizePortfolioColor(p.color));
                    setError(null);
                  }}
                  className="rounded-[6px] px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
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
                    className="rounded-[6px] px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-danger"
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
          <label htmlFor={nameInputId} className="eyebrow block">
            {mode === "create"
              ? "Name for the new portfolio"
              : `New name for “${target?.name ?? ""}”`}
          </label>
          <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
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
              className="min-w-0 flex-1 rounded-[11px] border border-line-strong bg-bg px-4 py-3 text-sm text-ink transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--glow)]"
            />
            <div className="flex gap-2.5">
              <button type="submit" className="btn btn-primary">
                {mode === "create" ? "Create" : "Save name"}
              </button>
              <button type="button" onClick={close} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>

          <div className="mt-4">
            <span className="eyebrow mb-2 block">Color (a visual aid, optional)</span>
            <ColorPalette value={draftColor} onChange={setDraftColor} />
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
          className="mt-4 rounded-[10px] border border-danger/30 bg-danger-soft px-4 py-3.5"
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
              className="rounded-[8px] bg-danger px-4 py-2 text-sm font-medium text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-colors hover:brightness-110"
            >
              Delete portfolio
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-[8px] border border-line-strong bg-surface px-4 py-2 text-sm text-ink transition-colors hover:bg-raised"
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
