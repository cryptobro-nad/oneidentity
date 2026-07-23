/**
 * A lightweight, non-sticky progress indicator for the Verified ONE flow.
 *
 * Purely presentational: it renders the step states it is handed and never
 * computes product rules, writes state, or changes availability. The caller
 * derives each state from the real draft/signature data using the existing
 * validation helpers.
 */
export type StepState = "upcoming" | "current" | "complete";

const marker: Record<StepState, string> = {
  upcoming: "border-line-strong text-ink-3",
  current: "border-accent text-accent-deep",
  complete: "border-accent bg-accent text-[color:var(--btn-ink)]",
};

const label: Record<StepState, string> = {
  upcoming: "text-ink-3",
  current: "font-medium text-ink",
  complete: "text-ink-2",
};

const stateWord: Record<StepState, string> = {
  upcoming: "upcoming",
  current: "current step",
  complete: "done",
};

export function StepProgress({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-3">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2.5">
          <span
            className="flex items-center gap-2.5"
            aria-current={s.state === "current" ? "step" : undefined}
          >
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[0.72rem] ${marker[s.state]}`}
            >
              {s.state === "complete" ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3 3 7-7.5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={`text-sm ${label[s.state]}`}>
              {s.label}
              <span className="sr-only"> ({stateWord[s.state]})</span>
            </span>
          </span>
          {i < steps.length - 1 ? (
            <span
              aria-hidden
              className={`mx-1 h-px w-5 sm:w-8 ${s.state === "complete" ? "bg-accent" : "bg-line-strong"}`}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
