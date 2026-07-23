import type { ReactNode } from "react";

/**
 * A section eyebrow: a short mono label with a leading rule, in the reference
 * style. Used to open marketing sections.
 */
export function PageEyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`flex items-center gap-[10px] font-mono text-[0.72rem] tracking-[0.14em] text-ink-3 uppercase sm:text-[0.685rem] sm:tracking-[0.16em] ${className}`}
    >
      <span aria-hidden className="h-px w-[22px] bg-line-strong" />
      {children}
    </p>
  );
}
