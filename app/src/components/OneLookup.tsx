"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { oneProfilePath } from "@/lib/registry/lookup";
import { resolveOneLookupAction } from "@/app/verified/actions";

/**
 * Public ONE lookup.
 *
 * Reads public Registry state only — no wallet connection, no signature, no
 * provider. Deliberately usable by someone who has never held a Monad wallet.
 */
export function OneLookup({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const submit = useCallback(
    async (event: FormEvent) => {
      // Enter in the input submits the form; this handles both paths.
      event.preventDefault();
      if (loading) return;

      setLoading(true);
      setError(null);
      setStatus("Looking up…");

      try {
        const result = await resolveOneLookupAction(value);
        if (result.ok) {
          setStatus("Verified ONE found. Opening the profile…");
          router.push(oneProfilePath(result.oneAddress));
          return;
        }
        // A failed lookup keeps the user here with a specific reason.
        setError(result.message);
        setStatus("");
      } catch {
        setError("The lookup failed unexpectedly. Please try again.");
        setStatus("");
      } finally {
        setLoading(false);
      }
    },
    [value, loading, router],
  );

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className={
        compact
          ? "rounded-[12px] border border-line bg-surface p-5 shadow-[var(--shadow-card)]"
          : "depth mx-auto max-w-xl rounded-[16px] border border-line bg-surface p-5"
      }
    >
      <div className={compact ? "" : "flex flex-wrap items-start justify-between gap-4"}>
        <div className="min-w-0">
          <h2
            id={`${inputId}-heading`}
            className={compact ? "text-sm font-semibold text-ink" : "text-xl font-semibold tracking-[-0.01em] text-ink"}
          >
            {compact ? "Look up another ONE" : "Look up a Verified ONE"}
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Enter a ONE identity address or a linked wallet address. No wallet connection needed.
          </p>
        </div>

        {/* Schematic address -> identity motif (full mode). Decorative: a
            placeholder and the ONE mark only, never real profile data. */}
        {!compact ? (
          <div aria-hidden className="hidden items-center gap-2 text-xs sm:flex">
            <span className="rounded-[6px] border border-line bg-raised px-2 py-1 font-mono text-faint">
              0x…
            </span>
            <svg width="18" height="8" viewBox="0 0 18 8" fill="none" className="shrink-0">
              <path d="M0 4h14" stroke="var(--line-strong)" strokeWidth="1.25" />
              <path d="M12 1l4 3-4 3" stroke="var(--accent)" strokeWidth="1.25" fill="none" />
            </svg>
            <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-accent-line bg-accent-soft px-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="font-medium text-accent">ONE</span>
            </span>
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} noValidate className="mt-4 space-y-2">
        <label htmlFor={inputId} className="eyebrow block">
          ONE identity or wallet address
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            inputMode="text"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={
              "min-w-0 flex-1 rounded-[8px] border border-line-strong bg-canvas px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:border-accent" +
              (compact
                ? ""
                : " transition-[border-color,box-shadow] focus:shadow-[0_0_0_3px_var(--accent-soft)]")
            }
          />
          <button
            type="submit"
            disabled={loading}
            className={
              "shrink-0 rounded-[8px] bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 " +
              (compact
                ? "transition-colors"
                : "transition-[transform,filter] hover:-translate-y-px disabled:hover:translate-y-0")
            }
          >
            {loading ? "Looking up…" : "View identity"}
          </button>
        </div>

        {error ? (
          <p id={`${inputId}-error`} role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        {/* Non-error progress, announced without interrupting. */}
        <p aria-live="polite" className="sr-only">
          {status}
        </p>
      </form>

      <p className="mt-3 text-xs text-faint">
        ONE reads public Monad data. No connection or signature required.
      </p>

      {!compact ? (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted transition-colors hover:text-ink">
            How lookup works
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-faint">
            A ONE identity address shows whether the identity is active or inactive. A wallet
            address shows only the Verified ONE it is linked to now. Past links cannot be looked up
            from a wallet address.
          </p>
        </details>
      ) : null}
    </section>
  );
}
