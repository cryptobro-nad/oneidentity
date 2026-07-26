import { ErrorNotice } from "@/components/Notices";
import type { DecodedError } from "@/lib/registry/errors";

/** Renders a decoded registry error with an expandable technical detail. Shared
 *  by the V1 profile's removal flow (the only remaining registry-write UI). */
export function ErrorPanel({ error }: { error: DecodedError }) {
  return (
    <ErrorNotice title={error.title}>
      <p>{error.detail}</p>
      {error.action ? <p className="mt-2 text-ink">{error.action}</p> : null}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-faint hover:text-muted">
          Technical details
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-[8px] bg-raised p-3 font-mono text-[11px] leading-relaxed text-muted">
          {error.name}
          {"\n"}
          {error.technical}
        </pre>
      </details>
    </ErrorNotice>
  );
}
