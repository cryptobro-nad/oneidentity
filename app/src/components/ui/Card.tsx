import type { ReactNode } from "react";

/**
 * Surface container. Border + a whisper of shadow — no glow, no tint.
 * `tone="accent"` gives a restrained left border for the current/primary item;
 * `tone="plain"` is a borderless grouping.
 */
export function Card({
  children,
  className = "",
  tone = "default",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent" | "plain";
  as?: "div" | "section" | "li";
}) {
  const tones = {
    default: "border border-line bg-surface shadow-[var(--shadow-card)]",
    accent: "border border-line border-l-2 border-l-accent bg-surface shadow-[var(--shadow-card)]",
    plain: "",
  } as const;
  return <Tag className={`rounded-[12px] ${tones[tone]} ${className}`}>{children}</Tag>;
}
