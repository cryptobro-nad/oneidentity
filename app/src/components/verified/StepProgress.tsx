/**
 * A lightweight, non-sticky progress indicator for the Verified ONE flow.
 *
 * Purely presentational: it renders the step states it is handed and never
 * computes product rules, writes state, or changes availability. The caller
 * derives each state from the real draft/signature data using the existing
 * validation helpers.
 */
export type StepState = "upcoming" | "current" | "complete";

const dot: Record<StepState, string> = {
  upcoming: "bg-line-strong",
  current: "bg-accent",
  complete: "bg-success",
};

const label: Record<StepState, string> = {
  upcoming: "text-faint",
  current: "font-medium text-ink",
  complete: "text-muted",
};

const stateWord: Record<StepState, string> = {
  upcoming: "upcoming",
  current: "current step",
  complete: "done",
};

export function StepProgress({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span
            className="flex items-center gap-2"
            aria-current={s.state === "current" ? "step" : undefined}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${dot[s.state]}`} />
            <span className={label[s.state]}>
              {s.label}
              <span className="sr-only"> ({stateWord[s.state]})</span>
            </span>
          </span>
          {i < steps.length - 1 ? (
            <span aria-hidden className="mx-1.5 h-px w-6 bg-line sm:w-8" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
