import type { ReactNode } from "react";

/**
 * A serious, intentional notice. A solid left marker bar signals severity at a
 * glance without decoration; the title and body do the rest. Used for warnings,
 * errors, partial states and confirmations alike.
 */
type Tone = "info" | "warn" | "danger" | "success";

const bar: Record<Tone, string> = {
  info: "before:bg-accent",
  warn: "before:bg-warn",
  danger: "before:bg-danger",
  success: "before:bg-success",
};

const surface: Record<Tone, string> = {
  info: "bg-raised",
  warn: "bg-warn-soft",
  danger: "bg-danger-soft",
  success: "bg-success-soft",
};

const titleColor: Record<Tone, string> = {
  info: "text-ink",
  warn: "text-ink",
  danger: "text-danger",
  success: "text-ink",
};

export function Notice({
  tone = "info",
  title,
  children,
  role,
  className = "",
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div
      role={role}
      className={
        `relative overflow-hidden rounded-[10px] border border-line ${surface[tone]} ` +
        `pl-5 pr-4 py-3.5 before:absolute before:left-0 before:top-0 before:h-full before:w-1 ` +
        `before:content-[''] ${bar[tone]} ${className}`
      }
    >
      {title ? <p className={`text-sm font-semibold ${titleColor[tone]}`}>{title}</p> : null}
      {children ? (
        <div className={`text-sm leading-relaxed text-muted ${title ? "mt-1" : ""}`}>{children}</div>
      ) : null}
    </div>
  );
}
