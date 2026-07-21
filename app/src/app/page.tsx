import Link from "next/link";
import { OneLookup } from "@/components/OneLookup";
import { Badge } from "@/components/ui/Badge";
import { MAX_WALLETS } from "@/lib/chain";

const ASSETS = "MON, stablecoins, supported memecoins and NFTs";

const PRIMARY_CTA =
  "inline-flex items-center justify-center rounded-[8px] bg-accent px-5 py-3 text-sm font-medium text-accent-ink shadow-[var(--shadow-card)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110";
const OUTLINE_CTA =
  "inline-flex items-center justify-center rounded-[8px] border border-line-strong bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent-line hover:bg-raised";

/** A single wallet chip. Real HTML: selectable, accessible, responsive. */
function WalletChip({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-[8px] border border-line bg-raised px-2.5 py-2 transition-colors hover:border-line-strong sm:px-3">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
      <span className="font-mono text-[11px] text-muted sm:text-sm">{label}</span>
    </div>
  );
}

/** The combined-view result. Real HTML; the accent edge marks the focal output. */
function OneResult() {
  return (
    <div className="w-full rounded-[12px] border border-line border-l-2 border-l-accent bg-raised px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
        <p className="text-sm font-semibold text-ink">ONE combined view</p>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        {ASSETS}, added up. With a per-wallet breakdown.
      </p>
    </div>
  );
}

/** Decorative convergence node (HTML circle + soft halo). Round in every aspect. */
function ConvergenceNode({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={className}>
      <span className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-[0.16] transition-transform duration-300 group-hover:scale-[1.4]" />
      <span className="relative block h-2.5 w-2.5 rounded-full bg-accent" />
    </span>
  );
}

/**
 * The wallet-to-ONE visual: a refined product component, enclosed in one
 * surface. Wallet chips and the combined-view result are real HTML; SVG is
 * used only for the decorative connector paths, and the convergence node is a
 * round HTML mark. Static; a restrained hover response only.
 */
function WalletToOne() {
  return (
    <div className="group depth depth-lift rounded-[16px] border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
        <span className="eyebrow">Combined view</span>
      </div>

      {/* Desktop: three wallet chips flow rightward into the combined result. */}
      <div className="mt-4 hidden items-stretch lg:flex">
        <ul className="flex w-36 flex-col justify-between gap-2.5 py-1">
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
        <div aria-hidden className="relative w-16 shrink-0 xl:w-20">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <g
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
              className="transition-colors group-hover:stroke-[color:var(--accent-line)]"
            >
              <path d="M0,14 C 55,14 45,50 100,50" vectorEffect="non-scaling-stroke" />
              <path d="M0,50 H100" vectorEffect="non-scaling-stroke" />
              <path d="M0,86 C 55,86 45,50 100,50" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          <ConvergenceNode className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2" />
        </div>
        <div className="flex flex-1 items-center">
          <OneResult />
        </div>
      </div>

      {/* Mobile: chips row, a short downward flow to the node, result beneath. */}
      <div className="mt-4 lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          <WalletChip label="Wallet A" />
          <WalletChip label="Wallet B" />
          <WalletChip label="Wallet C" />
        </div>
        <div aria-hidden className="relative h-7 w-full">
          <svg
            viewBox="0 0 100 28"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <g
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            >
              <path d="M16.7,0 C 16.7,18 50,8 50,22" vectorEffect="non-scaling-stroke" />
              <path d="M50,0 V22" vectorEffect="non-scaling-stroke" />
              <path d="M83.3,0 C 83.3,18 50,8 50,22" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          <ConvergenceNode className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />
        </div>
        <div className="mt-2.5">
          <OneResult />
        </div>
      </div>
    </div>
  );
}

/** Subtle, hero-only background: one soft violet radial on the visual side. */
function HeroBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(46% 52% at 78% 44%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 72%)",
      }}
    />
  );
}

function WayCard({
  badge,
  badgeTone,
  title,
  body,
  points,
  href,
  cta,
  accentPath,
}: {
  badge: string;
  badgeTone: "neutral" | "accent";
  title: string;
  body: string;
  points: string[];
  href: string;
  cta: string;
  accentPath?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col depth-soft depth-lift rounded-[16px] border bg-surface px-5 pt-4 pb-3 " +
        (accentPath ? "border-line border-t-2 border-t-accent" : "border-line")
      }
    >
      <div>
        <Badge tone={badgeTone}>{badge}</Badge>
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      <ul className="mt-3 flex-1 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm text-muted">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
            {p}
          </li>
        ))}
      </ul>
      {/* Both lower-section CTAs share one neutral outline style; fit-content and
          left-aligned on desktop, full-width on mobile. The only filled violet
          button on the homepage is the hero CTA. */}
      <Link
        href={href}
        className="mt-5 inline-flex w-full items-center justify-center rounded-[8px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent-line hover:bg-raised sm:w-auto sm:self-start"
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
      <section className="relative overflow-hidden pt-8 pb-10 sm:pt-10">
        <HeroBackground />
        <div className="relative grid gap-10 lg:grid-cols-[47fr_53fr] lg:items-center lg:gap-16">
          <div>
            <h1 className="text-4xl leading-[1.03] font-semibold tracking-[-0.04em] text-balance text-ink sm:text-6xl lg:text-[4rem]">
              Many wallets.
              <br />
              One view<span className="text-accent">.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-pretty text-muted">
              Track your MON, stablecoins, supported memecoins and NFTs across up to five Monad
              wallets. Keep it watch-only or create a Verified ONE to prove the wallets belong to
              you.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/portfolio" className={PRIMARY_CTA}>
                View my wallets together
              </Link>
              <Link href="/verified" className={OUTLINE_CTA}>
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
      <section className="border-t border-line py-8 sm:py-10">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Two ways to use ONE</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Start with a watch-only portfolio. Create a Verified ONE when you want to prove the
            wallets are yours.
          </p>
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <WayCard
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
          />
          <WayCard
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
            accentPath
          />
        </div>
      </section>

      {/* Public lookup */}
      <section className="border-t border-line py-8 sm:py-10">
        <OneLookup />
      </section>
    </div>
  );
}
