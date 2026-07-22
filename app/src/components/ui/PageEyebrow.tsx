import type { ReactNode } from "react";

/**
 * A section eyebrow: a short mono label with a leading rule, in the reference
 * style. Used to open marketing sections.
 */
export function PageEyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`flex items-center gap-[10px] font-mono text-[0.685rem] tracking-[0.16em] text-ink-3 uppercase ${className}`}
    >
      <span aria-hidden className="h-px w-[22px] bg-line-strong" />
      {children}
    </p>
  );
}
