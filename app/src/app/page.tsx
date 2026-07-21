import Link from "next/link";
import { OneLookup } from "@/components/OneLookup";
import { Badge } from "@/components/ui/Badge";
import { MAX_WALLETS } from "@/lib/chain";

const ASSETS = "MON, stablecoins, supported memecoins and NFTs";

/** A single wallet chip. Real HTML: selectable, accessible, responsive. */
function WalletChip({ label }: { label: string }) {
  return (
    <div className="rounded-[8px] border border-line bg-surface px-3 py-2 text-center font-mono text-xs text-muted shadow-[var(--shadow-card)] sm:text-sm">
      {label}
    </div>
  );
}

/** The combined-view result. Real HTML; a restrained accent edge marks the focal node. */
function OneResult() {
  return (
    <div className="rounded-[12px] border border-line border-l-2 border-l-accent bg-surface px-4 py-4 shadow-[var(--shadow-card)] sm:px-5 sm:py-5">
      <p className="text-sm font-semibold text-ink">ONE combined view</p>
      <p className="mt-1.5 text-sm text-muted">{ASSETS}, added up. With a per-wallet breakdown.</p>
    </div>
  );
}

/**
 * The wallet-to-ONE focal visual. Chips and the result are real HTML; only the
 * connector paths and the convergence node are SVG (decorative, aria-hidden).
 * Static by design. Two clean layouts: horizontal on desktop, compact on mobile.
 */
function WalletToOne() {
  return (
    <div>
      {/* Desktop: three chips flow rightward into the combined result. */}
      <div className="hidden items-stretch gap-0 lg:flex">
        <ul className="flex flex-col justify-between gap-4 py-1">
          <li>
            <WalletChip label="Wallet A" />
          </li>
          <li>
            <WalletChip label="Wallet B" />
          </li>
          <li>
            <WalletChip label="Wallet C" />
          </li>
        </ul>
        <div aria-hidden className="relative w-16 shrink-0 xl:w-24">
          <svg
            viewBox="0 0 64 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <g
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            >
              <path d="M0,14 C 28,14 22,50 42,50" />
              <path d="M0,50 H42" />
              <path d="M0,86 C 28,86 22,50 42,50" />
            </g>
            <line
              x1="42"
              y1="50"
              x2="64"
              y2="50"
              stroke="var(--accent)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx="42" cy="50" r="3" fill="var(--accent)" />
          </svg>
        </div>
        <div className="flex flex-1 items-center">
          <OneResult />
        </div>
      </div>

      {/* Mobile: three chips in a row, a short downward flow, the result beneath. */}
      <div className="lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          <WalletChip label="Wallet A" />
          <WalletChip label="Wallet B" />
          <WalletChip label="Wallet C" />
        </div>
        <div aria-hidden className="relative h-6 w-full">
          <svg
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <g
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            >
              <path d="M16.7,0 C 16.7,15 50,7 50,18" />
              <path d="M50,0 V18" />
              <path d="M83.3,0 C 83.3,15 50,7 50,18" />
            </g>
            <circle cx="50" cy="18" r="3" fill="var(--accent)" />
          </svg>
        </div>
        <div className="mt-1.5">
          <OneResult />
        </div>
      </div>
    </div>
  );
}

/** Subtle, hero-only background. Radial wash plus a whisper of converging lines. */
function HeroBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 55% at 80% 26%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 68%)",
        }}
      />
      <svg
        className="absolute top-0 right-0 hidden h-full w-1/2 opacity-[0.3] lg:block"
        viewBox="0 0 300 300"
        preserveAspectRatio="none"
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      >
        <path d="M300,40 C 210,60 150,120 60,150" vectorEffect="non-scaling-stroke" />
        <path d="M300,150 C 210,150 150,150 60,151" vectorEffect="non-scaling-stroke" />
        <path d="M300,260 C 210,240 150,182 60,152" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function WayColumn({
  badge,
  badgeTone,
  title,
  body,
  points,
  href,
  cta,
  primary,
  className = "",
}: {
  badge: string;
  badgeTone: "neutral" | "accent";
  title: string;
  body: string;
  points: string[];
  href: string;
  cta: string;
  primary?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="self-start">
        <Badge tone={badgeTone}>{badge}</Badge>
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      <ul className="mt-4 flex-1 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm text-muted">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
            {p}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={
          "mt-6 inline-flex w-full items-center justify-center rounded-[8px] px-4 py-2.5 text-sm font-medium transition-colors sm:w-auto " +
          (primary
            ? "bg-accent text-accent-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:brightness-110"
            : "border border-line-strong bg-surface text-ink hover:bg-raised")
        }
      >
        {cta}
      </Link>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      {/* Hero */}
      <section className="relative overflow-hidden pt-8 pb-14 sm:pt-10 sm:pb-16">
        <HeroBackground />
        <div className="relative grid gap-10 lg:grid-cols-[46fr_54fr] lg:items-center lg:gap-14">
          <div>
            <h1 className="text-4xl leading-[1.03] font-semibold tracking-[-0.035em] text-balance text-ink sm:text-6xl">
              Many wallets.
              <br />
              One view.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-pretty text-muted">
              Track your MON, stablecoins, supported memecoins and NFTs across up to five Monad
              wallets. Keep it watch-only or create a Verified ONE to prove the wallets belong to
              you.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/portfolio"
                className="inline-flex items-center justify-center rounded-[8px] bg-accent px-5 py-3 text-sm font-medium text-accent-ink shadow-[0_1px_2px_rgba(16,24,40,0.1)] transition-colors hover:brightness-110"
              >
                View my wallets together
              </Link>
              <Link
                href="/verified"
                className="inline-flex items-center justify-center rounded-[8px] border border-line-strong bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
              >
                Create a Verified ONE
              </Link>
            </div>

            <p className="mt-5 text-sm text-faint">
              No wallet connection or signature needed. Nothing is written onchain.
            </p>
          </div>

          <div className="lg:pl-4">
            <WalletToOne />
          </div>
        </div>
      </section>

      {/* Two ways to use ONE */}
      <section className="border-t border-line py-11 sm:py-12">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Two ways to use ONE</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Start with a watch-only portfolio. Create a Verified ONE when you want to prove the
            wallets are yours.
          </p>
        </div>
        <div className="mt-8 grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
          <WayColumn
            badge="No connection needed"
            badgeTone="neutral"
            title="Watch-only portfolios"
            body="Add public wallet addresses and view their combined balances. No wallet connection or signature required."
            points={[
              `Up to ${MAX_WALLETS} wallets per portfolio`,
              "MON, stablecoins, supported memecoins and NFTs",
              "Combined totals with a per-wallet breakdown",
            ]}
            href="/portfolio"
            cta="Open watch-only portfolio"
            primary
            className="pb-8 md:pr-10 md:pb-0"
          />
          <WayColumn
            badge="Proves control"
            badgeTone="accent"
            title="Verified ONE"
            body="Link wallets you control and create one public identity that other apps can look up."
            points={[
              "Each secondary wallet signs a gasless authorization",
              "The primary wallet completes one Monad Mainnet transaction",
              "No funds move and ONE never takes custody",
            ]}
            href="/verified"
            cta="Create a Verified ONE"
            className="pt-8 md:pt-0 md:pl-10"
          />
        </div>
      </section>

      {/* Public lookup */}
      <div className="border-t border-line py-10">
        <OneLookup />
      </div>
    </div>
  );
}
