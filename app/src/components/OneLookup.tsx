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
          ? "rounded-xl border border-line bg-surface p-5"
          : "rounded-2xl border border-line bg-surface p-6 sm:p-8"
      }
    >
      <h2
        id={`${inputId}-heading`}
        className={compact ? "text-sm font-medium text-ink" : "text-lg font-medium text-ink"}
      >
        {compact ? "Look up another ONE" : "Look up a Verified ONE"}
      </h2>
      <p className="mt-1.5 text-sm text-muted">
        Paste a ONE identity address or a wallet currently linked to one.
      </p>

      <form onSubmit={submit} noValidate className="mt-4 space-y-2">
        <label htmlFor={inputId} className="block text-xs text-faint">
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
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
        No connection or signature required. ONE reads public Monad data.
      </p>

      {!compact ? (
        <p className="mt-2 text-xs text-faint">
          A ONE address resolves whether the identity is active or inactive. A wallet address
          resolves only the wallet&apos;s current active ONE — historical relationships cannot be
          reverse-resolved from a wallet with the current Registry API.
        </p>
      ) : null}
    </section>
  );
}
