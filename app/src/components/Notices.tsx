import type { ReactNode } from "react";
import { Notice } from "./ui/Notice";

/**
 * The unverified banner. Deliberately always visible on the portfolio page and
 * never dismissible — this mode makes no claim about who controls the wallets,
 * and the wording avoids calling it "private", which it is not.
 */
export function UnverifiedNotice() {
  return (
    <Notice tone="warn" title="Watch-only (unverified)">
      You entered these addresses by hand. ONE has not checked that they belong to the same person.
      Nothing here is written onchain.
    </Notice>
  );
}

export function ErrorNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Notice tone="danger" role="alert" title={title}>
      {children}
    </Notice>
  );
}

/**
 * Shown when some reads succeeded and others failed. Lists exactly which calls
 * failed so the user knows the totals are a lower bound, not the whole picture.
 */
export function PartialNotice({ failures }: { failures: { label: string; detail: string }[] }) {
  return (
    <Notice tone="warn" role="status" title="Partial data loaded">
      <p>
        {failures.length} {failures.length === 1 ? "call" : "calls"} failed. The totals below
        exclude {failures.length === 1 ? "it" : "them"} rather than counting{" "}
        {failures.length === 1 ? "it" : "them"} as zero.
      </p>
      <ul className="mt-3 space-y-1.5">
        {failures.map((f) => (
          <li key={f.label} className="font-mono text-xs text-muted">
            <span className="text-ink">{f.label}</span>: {f.detail}
          </li>
        ))}
      </ul>
    </Notice>
  );
}
