/**
 * The ONE brand mark: three source dots and connecting paths converging into
 * one destination dot, beside the serif ONE wordmark.
 *
 * The mark uses `currentColor` for the sources and paths (so it takes the
 * surrounding ink colour) and `--spark` for the single destination dot — the
 * one place violet appears in the whole product. Decorative internals are
 * hidden from assistive tech; the accessible name comes from the wrapping link
 * (aria-label) and the visible "ONE" text.
 */
export function OneLogo({
  size = 26,
  showWordmark = true,
  wordmarkSize = "1.42rem",
  className = "",
}: {
  size?: number;
  showWordmark?: boolean;
  wordmarkSize?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-[11px] text-ink ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 26 26"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="4" cy="5" r="2.4" fill="currentColor" opacity=".38" />
        <circle cx="4" cy="13" r="2.4" fill="currentColor" opacity=".62" />
        <circle cx="4" cy="21" r="2.4" fill="currentColor" opacity=".38" />
        <path
          d="M6.6 5.4C13 5.4 13 13 19 13M6.6 13H19M6.6 20.6C13 20.6 13 13 19 13"
          stroke="currentColor"
          strokeWidth="1.1"
          opacity=".4"
        />
        <circle cx="21" cy="13" r="3.6" fill="var(--spark)" />
      </svg>
      {showWordmark ? (
        <span
          className="font-serif leading-none tracking-[0.01em]"
          style={{ fontSize: wordmarkSize }}
        >
          ONE
        </span>
      ) : null}
    </span>
  );
}
