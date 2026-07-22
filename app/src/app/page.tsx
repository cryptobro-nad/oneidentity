import Link from "next/link";
import { Fraunces } from "next/font/google";
import { OneLookup } from "@/components/OneLookup";
import { MAX_WALLETS } from "@/lib/chain";

/** Homepage-only serif display face. Scoped via the .home wrapper. */
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

const ASSETS = "MON, stablecoins, supported memecoins and NFTs";

/**
 * Real, public reference identity from docs/product-truth.md, shown only as an
 * example of a Verified ONE. Not the visitor's data; nothing here is invented.
 */
const REF = {
  one: "0x1139…4AaA",
  primary: "0x017F…0D8B",
  secondary: "0xe3A0…0a31",
} as const;

const PRIMARY_CTA =
  "inline-flex items-center justify-center rounded-[8px] bg-accent px-5 py-3 text-sm font-medium text-accent-ink shadow-[var(--depth-shadow-soft)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110";
const UNDERLINE_CTA =
  "inline-flex items-center justify-center border-b-2 border-ink px-1 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent";
const OUTLINE_CTA =
  "inline-flex items-center justify-center rounded-[8px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent-line hover:bg-raised";

/** A single wallet node. Real HTML: selectable, accessible, responsive. */
function WalletNode({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[9px] border border-line-strong bg-surface px-3 py-2 font-mono text-[11.5px] text-muted shadow-[0_1px_2px_rgba(40,34,22,0.05)] sm:px-3.5 sm:py-2.5 sm:text-[13px]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
      {label}
    </div>
  );
}

/** The combined-view anchor: a small, branded destination for the network. */
function CombinedAnchor() {
  return (
    <div className="w-full max-w-[17rem] rounded-[14px] border border-line border-l-2 border-l-accent bg-surface p-5 shadow-[var(--obj-shadow)]">
      <div className="flex items-baseline gap-2">
        <span aria-hidden className="h-2 w-2 self-center rounded-full bg-accent" />
        <span className="serif text-lg text-ink">ONE</span>
        <span className="eyebrow">combined view</span>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
        {ASSETS}, resolved to one identity.
      </p>
    </div>
  );
}

/**
 * Supporting wallet-to-ONE network. Explains "many wallets, one view" and is
 * given real presence and a clear convergence, but stays secondary to the
 * headline. Real HTML nodes; SVG only for the connector paths. No fake data,
 * no glow.
 */
function SupportingNetwork() {
  return (
    <div>
      {/* Desktop: four wallets converge into one combined view. */}
      <div className="hidden items-stretch lg:flex">
        <ul className="flex w-40 flex-col justify-between gap-4 py-2">
          <li>
            <WalletNode label="Wallet A" />
          </li>
          <li>
            <WalletNode label="Wallet B" />
          </li>
          <li>
            <WalletNode label="Wallet C" />
          </li>
          <li>
            <WalletNode label="Wallet D" />
          </li>
        </ul>
        <div aria-hidden className="relative w-24 shrink-0 xl:w-32">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <g fill="none" stroke="var(--line-strong)" strokeWidth="1.15" vectorEffect="non-scaling-stroke">
              <path d="M0,10 C 55,10 50,50 100,50" vectorEffect="non-scaling-stroke" />
              <path d="M0,37 C 55,37 55,50 100,50" vectorEffect="non-scaling-stroke" />
              <path d="M0,63 C 55,63 55,50 100,50" vectorEffect="non-scaling-stroke" />
              <path d="M0,90 C 55,90 50,50 100,50" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          <span aria-hidden className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2">
            <span className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent opacity-40" />
            <span className="relative block h-3 w-3 rounded-full bg-accent" />
          </span>
        </div>
        <div className="flex flex-1 items-center pl-2">
          <CombinedAnchor />
        </div>
      </div>

      {/* Mobile: compact vertical flow (kept). */}
      <div className="lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          <WalletNode label="Wallet A" />
          <WalletNode label="Wallet B" />
          <WalletNode label="Wallet C" />
        </div>
        <div aria-hidden className="relative h-6 w-full">
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <g fill="none" stroke="var(--line-strong)" strokeWidth="1.15" vectorEffect="non-scaling-stroke">
              <path d="M16.7,0 C 16.7,16 50,7 50,20" vectorEffect="non-scaling-stroke" />
              <path d="M50,0 V20" vectorEffect="non-scaling-stroke" />
              <path d="M83.3,0 C 83.3,16 50,7 50,20" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          <span
            aria-hidden
            className="absolute bottom-0 left-1/2 block h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-accent"
          />
        </div>
        <div className="mt-2.5 [&>div]:max-w-none">
          <CombinedAnchor />
        </div>
      </div>
    </div>
  );
}

/**
 * The layered identity object: the main payoff. Real HTML, real public
 * reference data (see REF). The peek layers behind the face are the linked
 * wallets. No fake balances, names, activity, or status.
 */
function IdentityObject({ full = false }: { full?: boolean }) {
  return (
    <div className="pt-6 pr-8">
      <div className="relative">
        <span
          aria-hidden
          className="absolute inset-0 translate-x-[26px] -translate-y-[22px] rounded-[14px] border border-line bg-raised"
        >
          <span className="absolute top-2 right-3.5 font-mono text-[11px] text-faint">{REF.secondary}</span>
        </span>
        <span
          aria-hidden
          className="absolute inset-0 translate-x-[13px] -translate-y-[11px] rounded-[14px] border border-line bg-raised"
        >
          <span className="absolute top-2 right-3.5 font-mono text-[11px] text-faint">{REF.primary}</span>
        </span>

        <div className="relative rounded-[14px] border border-line-strong bg-surface p-5 shadow-[var(--obj-shadow)]">
          <div className="flex items-center justify-between">
            <span className="eyebrow">One identity</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-success">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
              Active
            </span>
          </div>
          <p className="mt-3 font-mono text-lg text-ink">{REF.one}</p>
          <p className="mt-1.5 text-[12.5px] text-muted">
            Identity address, not a wallet. Do not send funds to it.
          </p>

          {full ? (
            <>
              <div className="my-4 h-px bg-line" />
              <div className="flex items-center justify-between py-1 text-[13px]">
                <span className="text-muted">Primary wallet</span>
                <span className="inline-flex items-center gap-2 font-mono text-[12px] text-ink">
                  {REF.primary}
                  <span className="rounded-full border border-accent px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.05em] text-accent uppercase">
                    primary
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between py-1 text-[13px]">
                <span className="text-muted">Secondary wallet</span>
                <span className="inline-flex items-center gap-2 font-mono text-[12px] text-ink">
                  {REF.secondary}
                  <span className="rounded-full border border-line-strong px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.05em] text-faint uppercase">
                    secondary
                  </span>
                </span>
              </div>
              <div className="mt-3.5 flex items-center justify-between">
                <span className="text-[12.5px] text-muted">
                  <span className="serif text-[15px] text-ink">2</span> linked wallets
                </span>
                <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted">
                  <span
                    aria-hidden
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-accent"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  Created onchain
                </span>
              </div>
            </>
          ) : (
            <p className="mt-3 text-[12.5px] text-muted">
              2 linked wallets. Created onchain, one Monad Mainnet transaction.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className={`${fraunces.variable} home mx-auto w-full max-w-6xl px-5 sm:px-8`}>
      {/* Hero: serif-led, network in a supporting role */}
      <section className="pt-10 pb-6 sm:pt-14 sm:pb-8">
        <p className="eyebrow">Overview · many wallets, one view</p>
        <div className="mt-4 grid gap-10 lg:grid-cols-[44fr_56fr] lg:items-center lg:gap-16">
          <div>
            <h1 className="serif text-5xl leading-[1.02] text-balance text-ink sm:text-6xl lg:text-[4.25rem]">
              Many wallets.
              <br />
              One view<span className="text-accent">.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-pretty text-muted">
              Track your MON, stablecoins, supported memecoins and NFTs across up to five Monad
              wallets. Keep it watch-only or create a Verified ONE to prove the wallets belong to
              you.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/portfolio" className={PRIMARY_CTA}>
                View my wallets together
              </Link>
              <Link href="/verified" className={UNDERLINE_CTA}>
                Create a Verified ONE
              </Link>
            </div>
            <p className="mt-6 font-mono text-[13px] text-faint">
              No wallet connection or signature needed. Nothing is written onchain.
            </p>
          </div>
          <div className="lg:pl-8">
            <SupportingNetwork />
          </div>
        </div>
      </section>

      {/* Two ways: watch-only network group vs the Verified identity object */}
      <section className="border-t border-line py-10 sm:py-12">
        <p className="eyebrow">Two ways</p>
        <h2 className="serif mt-2 text-3xl text-ink sm:text-4xl">Two ways to use ONE</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Start with a watch-only portfolio. Create a Verified ONE when you want to prove the
          wallets are yours, recorded onchain.
        </p>
        <div className="mt-8 grid md:grid-cols-2 md:divide-x md:divide-line">
          {/* Watch-only: grouped, not linked */}
          <div className="flex flex-col md:pr-10">
            <p className="eyebrow">No connection needed</p>
            <h3 className="serif mt-2 text-2xl text-ink">Watch-only portfolios</h3>

            {/* Grouping visual: several wallets bracketed into one combined view.
                Dashed = grouped locally, not linked onchain (the watch-only
                counterpart to the Verified identity object). No balances. */}
            <div aria-hidden className="mt-5 max-w-[19rem]">
              <div className="relative pl-4">
                <span className="absolute top-1 bottom-1 left-0 w-px border-l border-dashed border-line-strong" />
                <p className="eyebrow">Combined view · grouped locally</p>
                <div className="mt-2.5 space-y-1.5">
                  {["Wallet A", "Wallet B", "Wallet C"].map((w) => (
                    <div
                      key={w}
                      className="flex items-center justify-between font-mono text-[12px] text-muted"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-faint" />
                        {w}
                      </span>
                      <span className="text-faint">0x…</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 border-t border-dashed border-line pt-2.5 text-[12px] leading-relaxed text-muted">
                  {ASSETS}, added up. Not linked onchain.
                </p>
              </div>
            </div>

            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
              Add public wallet addresses and view their combined balances. Grouped locally, not
              linked onchain.
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
              {[
                `Up to ${MAX_WALLETS} wallets per portfolio`,
                "MON, stablecoins, supported memecoins and NFTs",
                "Combined totals with a per-wallet breakdown",
              ].map((p) => (
                <li key={p} className="flex gap-2.5">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-faint" />
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Link
                href="/portfolio"
                className={
                  "inline-flex items-center justify-center rounded-[8px] bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink shadow-[var(--depth-shadow-soft)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110"
                }
              >
                Open watch-only portfolio
              </Link>
            </div>
          </div>

          {/* Verified ONE: the identity object outcome */}
          <div className="mt-10 flex flex-col md:mt-0 md:pl-10">
            <p className="eyebrow text-accent">Proves control</p>
            <h3 className="serif mt-2 text-2xl text-ink">Verified ONE</h3>
            <div className="mt-1">
              <IdentityObject />
            </div>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              Link wallets you control and create one public identity that other apps can look up.
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
              {[
                "Each secondary wallet signs a gasless authorization",
                "The primary wallet completes one Monad Mainnet transaction",
                "No funds move and ONE never takes custody",
              ].map((p) => (
                <li key={p} className="flex gap-2.5">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Link href="/verified" className={UNDERLINE_CTA}>
                Create a Verified ONE
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Public profile + resolve: the identity object as the shareable payoff */}
      <section className="border-t border-line py-10 sm:py-12">
        <p className="eyebrow">Public profile · resolve</p>
        <h2 className="serif mt-2 text-3xl text-ink sm:text-4xl">Look up any identity. Share your own.</h2>
        <div className="mt-8 grid gap-12 lg:grid-cols-[46fr_54fr] lg:items-start">
          <div>
            <IdentityObject full />
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-[12.5px] text-muted">
              oneidentity.app/one/{REF.one}
            </div>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
              Anyone can look this up. The linked wallets signed to join, and the link is recorded
              onchain. Wallets can leave later, but the record that they were linked stays.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              {[
                "One public identity address, active onchain",
                "Primary and secondary wallets, linked by signature",
                "No custody, no funds moved, no approvals",
              ].map((p) => (
                <li key={p} className="flex gap-2.5">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/verified" className={OUTLINE_CTA}>
                Create your own
              </Link>
            </div>
          </div>
          <div className="border-t border-line pt-6 lg:border-t-0 lg:pt-1">
            <OneLookup />
          </div>
        </div>
      </section>
    </div>
  );
}
