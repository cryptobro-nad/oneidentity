/**
 * Network status indicator. Shows a live dot and the network name. The dot
 * animation is decorative (a steady heartbeat), not bound to any data, and it
 * stops under reduced-motion.
 *
 * `compact` renders a quiet, borderless label (used in the header so it recedes
 * next to the accent Connect button); the default is the bordered pill.
 */
export function StatusPill({
  label = "Monad Mainnet",
  className = "",
  compact = false,
}: {
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const base = compact
    ? "gap-1.5 font-mono text-[0.7rem] tracking-[0.03em] text-faint"
    : "gap-2 rounded-full border border-line bg-surface px-[11px] py-[7px] font-mono text-[0.72rem] tracking-[0.04em] text-ink-2 sm:px-[13px]";
  return (
    <span title={label} className={`inline-flex items-center ${base} ${className}`}>
      <span aria-hidden className="dot-live" />
      <span className="net-name">{label}</span>
    </span>
  );
}
