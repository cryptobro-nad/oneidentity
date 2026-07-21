import type { ReactNode } from "react";

/**
 * Status badge — the ONLY place a pill shape is used.
 *
 * Tone maps to meaning: `accent` for the primary role, `success` for an active
 * verified state, `warn` for an unverified/attention state, `danger` for a
 * problem, `neutral` for a plain tag (secondary role, watch-only, network).
 */
type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-raised text-muted border border-line",
  accent: "bg-accent-soft text-accent border border-accent-line",
  success: "bg-success-soft text-success border border-success/25",
  warn: "bg-warn-soft text-warn border border-warn/25",
  danger: "bg-danger-soft text-danger border border-danger/25",
};

export function Badge({
  tone = "neutral",
  children,
  dot = false,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}
