/**
 * Network status pill. Shows a live dot and the network name. The dot animation
 * is decorative (a steady heartbeat), not bound to any data, and it stops under
 * reduced-motion.
 */
export function StatusPill({
  label = "Monad Mainnet",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface px-[11px] py-[7px] font-mono text-[0.72rem] tracking-[0.04em] text-ink-2 sm:px-[13px] ${className}`}
    >
      <span aria-hidden className="dot-live" />
      <span className="net-name">{label}</span>
    </span>
  );
}
