import { forwardRef, type ButtonHTMLAttributes } from "react";

/**
 * The one button in ONE.
 *
 * Variants encode intent, not decoration: exactly one `primary` per screen,
 * `secondary` for the reversible alternative, `destructive` for removal, and
 * `ghost` for low-weight inline actions. Radius is a deliberate 8px — pills are
 * reserved for status badges, never actions.
 */
type Variant = "primary" | "secondary" | "destructive" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[8px] font-medium transition-colors " +
  "focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-4 py-2.5 text-sm",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:brightness-110 active:brightness-95",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-raised",
  destructive: "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
  ghost: "text-muted hover:bg-raised hover:text-ink",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = "secondary", size = "md", className = "", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
