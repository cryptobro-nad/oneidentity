import Link from "next/link";

const TAG =
  "font-mono text-[0.66rem] sm:text-[0.62rem] tracking-[0.1em] rounded-[5px] border px-2 py-[3px]";

/**
 * The layered identity object. The front surface is a full-opacity sibling of
 * the lookup card (same radius / border / shadow family); the rear stack layers
 * sit behind it at reduced opacity and never darken the front. Addresses render
 * in mono. All values are passed in — nothing here is invented.
 */
export function IdentityCard({
  address,
  primary,
  secondary,
  linkedCount,
  profileHref,
  className = "",
}: {
  address: string;
  primary: string;
  secondary: string;
  linkedCount: number;
  profileHref?: string;
  className?: string;
}) {
  return (
    <div className={`pt-3.5 pr-3.5 ${className}`}>
      <div className="relative">
        {/* rear stack layers: behind, lighter, offset up-right; never darken the front */}
        <div
          aria-hidden
          className="absolute inset-0 -translate-y-3.5 translate-x-3.5 rounded-[20px] border border-line bg-surface opacity-40"
        />
        <div
          aria-hidden
          className="absolute inset-0 -translate-y-[7px] translate-x-[7px] rounded-[20px] border border-line bg-surface opacity-70"
        />

        {/* front card — full opacity, gradient surface, same shadow family as the lookup */}
        <div
          className="card relative border-line-strong p-6 sm:p-7"
          style={{ background: "linear-gradient(160deg, var(--surface-2), var(--surface))" }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="eyebrow">ONE identity</span>
            <span className="inline-flex items-center gap-2 font-mono text-[0.76rem] text-accent-live sm:text-[0.72rem]">
              <span aria-hidden className="dot-live" />
              Active
            </span>
          </div>

          <p className="mono mt-3.5 text-[clamp(1.15rem,2.4vw,1.5rem)] tracking-[-0.01em] text-ink">
            {address}
          </p>
          <p className="mt-2 max-w-[40ch] text-[0.85rem] text-ink-3 sm:text-[0.815rem]">
            This is an identity address, not a wallet. Do not send funds to it.
          </p>

          <div className="mt-5 grid gap-3 border-t border-dashed border-line-strong pt-[18px]">
            <div className="flex items-center justify-between gap-3 text-[0.875rem] text-ink-2">
              <span>Primary wallet</span>
              <span className="flex items-center gap-2.5">
                <span className="mono text-[0.83rem] text-ink">{primary}</span>
                <span className={`${TAG} border-accent text-accent-deep`}>PRIMARY</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[0.875rem] text-ink-2">
              <span>Secondary wallet</span>
              <span className="flex items-center gap-2.5">
                <span className="mono text-[0.83rem] text-ink">{secondary}</span>
                <span className={`${TAG} border-line-strong text-ink-3`}>SECONDARY</span>
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-[0.83rem] text-ink-2">
            <span>
              <strong className="font-serif text-[1.15rem] text-ink">{linkedCount}</strong> linked
              wallets
            </span>
            <span className="inline-flex items-center gap-2 font-mono text-[0.76rem] text-accent-live sm:text-[0.73rem]">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="8" cy="8" r="6.2" />
                <path d="M5.6 8.2l1.7 1.7 3.2-3.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              CREATED ONCHAIN
            </span>
          </div>
        </div>
      </div>

      {profileHref ? (
        <Link
          href={profileHref}
          className="mt-[18px] inline-flex items-center gap-2.5 rounded-[9px] border border-line bg-surface px-[13px] py-[9px] font-mono text-[0.8rem] text-ink-2 transition-colors hover:border-accent hover:text-ink sm:mt-[22px] sm:text-[0.755rem]"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="8" rx="2" />
            <path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7" />
          </svg>
          oneidentity.app/one/{address}
        </Link>
      ) : null}
    </div>
  );
}
