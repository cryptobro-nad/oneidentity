import type { ReactNode } from "react";

/**
 * The unverified banner. Deliberately always visible on the portfolio page and
 * never dismissible — this mode makes no claim about who controls the wallets,
 * and the wording avoids calling it "private", which it is not.
 */
export function UnverifiedNotice() {
  return (
    <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
        />
        <div>
          <p className="text-sm font-medium text-ink">Unverified portfolio</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            These addresses were entered manually. ONE has not verified that they belong to the
            same person.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ErrorNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3.5 sm:px-5"
    >
      <p className="text-sm font-medium text-danger">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

/**
 * Shown when some reads succeeded and others failed. Lists exactly which calls
 * failed so the user knows the totals are a lower bound, not the whole picture.
 */
export function PartialNotice({
  failures,
}: {
  failures: { label: string; detail: string }[];
}) {
  return (
    <div
      role="status"
      className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5 sm:px-5"
    >
      <p className="text-sm font-medium text-ink">Partial data loaded</p>
      <p className="mt-1 text-sm text-muted">
        {failures.length} {failures.length === 1 ? "call" : "calls"} failed. The totals below
        exclude {failures.length === 1 ? "it" : "them"} rather than counting{" "}
        {failures.length === 1 ? "it" : "them"} as zero.
      </p>
      <ul className="mt-3 space-y-1.5">
        {failures.map((f) => (
          <li key={f.label} className="font-mono text-xs text-muted">
            <span className="text-ink">{f.label}</span> — {f.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
