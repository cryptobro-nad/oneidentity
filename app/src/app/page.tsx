import Link from "next/link";
import { OneLookup } from "@/components/OneLookup";
import { NetworkDiagram } from "@/components/brand/NetworkDiagram";
import { IdentityCard } from "@/components/brand/IdentityCard";
import { Reveal } from "@/components/motion/Reveal";
import { PageEyebrow } from "@/components/ui/PageEyebrow";
import { MAX_WALLETS } from "@/lib/chain";

// A real, public Verified ONE, shown as an example. The card links to its live
// profile; the values below are that identity's real onchain state.
const EXAMPLE = {
  address: "0x1139…4AaA",
  primary: "0x017F…0D8B",
  secondary: "0xe3A0…0a31",
  linkedCount: 2,
  href: "/one/0x1139dec3A681C96807D8C277601655A707494AaA",
} as const;

/** Inline arrow that nudges right on button hover (see `.btn .arw` in globals). */
function Arrow() {
  return (
    <svg
      className="arw"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

/** The convergence-line motif reused as a compact divider between sections. */
function MergeDivider() {
  return (
    <div className="wrap py-1 sm:py-3" aria-hidden>
      <svg
        className="block h-[22px] w-full text-line-strong"
        viewBox="0 0 1180 22"
        preserveAspectRatio="none"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M0 3 C 400 3, 430 11, 590 11" />
          <path d="M0 11 H 590" />
          <path d="M0 19 C 400 19, 430 11, 590 11" />
          <path d="M590 11 H 1180" />
        </g>
        <circle cx="592" cy="11" r="3" fill="var(--accent)" stroke="none" />
      </svg>
    </div>
  );
}

/** A truthful guarantee tile for the "hard limits" grid. */
function Guard({ index, label, title, body }: { index: string; label: string; title: string; body: string }) {
  return (
    <div className="card card-hover p-5 sm:p-7">
      <div className="flex items-center gap-2.5 font-mono text-[0.66rem] tracking-[0.12em] text-ink-3">
        <span className="text-accent-deep">{index}</span>
        <span className="h-px w-4 bg-line-strong" />
        <span>{label}</span>
      </div>
      <h3 className="mt-4 font-serif text-[1.4rem] leading-tight text-ink">{title}</h3>
      <p className="mt-2.5 text-[0.9rem] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="wrap pt-8 pb-4 sm:pt-16 sm:pb-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
          <div>
            <Reveal>
              <PageEyebrow>Watch-only and Verified identity</PageEyebrow>
            </Reveal>
            <Reveal delay={70}>
              <h1 className="display mt-5 text-[clamp(2.9rem,6.6vw,5.1rem)]">
                Many wallets.
                <br />
                One <em>view</em>.
              </h1>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-5 max-w-[46ch] text-[1.075rem] leading-relaxed text-ink-2">
                Track your MON, stablecoins, supported memecoins and NFTs across up to five Monad
                wallets. Keep it watch-only, or create a Verified ONE to prove the wallets belong to
                you.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link href="/portfolio" className="btn btn-primary">
                  View my wallets together
                  <Arrow />
                </Link>
                <Link href="/verified" className="btn btn-quiet">
                  Create a Verified ONE
                </Link>
              </div>
            </Reveal>
            <Reveal delay={260}>
              <p className="mt-7 max-w-[46ch] border-l border-line pl-3.5 font-mono text-[0.8rem] leading-[1.7] text-ink-3 sm:mt-8 sm:text-[0.75rem]">
                Watch-only needs no wallet connection or signature. Nothing is written onchain until
                you choose to create a Verified ONE.
              </p>
            </Reveal>
          </div>

          <Reveal delay={120} className="lg:pl-4">
            <NetworkDiagram />
          </Reveal>
        </div>
      </section>

      <MergeDivider />

      {/* ---------- Two ways ---------- */}
      <section id="ways" className="wrap py-9 sm:py-16">
        <Reveal className="max-w-[52ch]">
          <PageEyebrow>Two ways to use ONE</PageEyebrow>
          <h2 className="display mt-4 text-balance text-[clamp(2rem,4vw,2.9rem)]">
            Start watching. <em>Verify</em> when you want to.
          </h2>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-ink-2">
            A watch-only portfolio groups public addresses on your device. A Verified ONE records,
            onchain, that the wallets are yours.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:mt-10 sm:gap-5 md:grid-cols-2">
          {/* Watch-only — the primary entry path (filled CTA) */}
          <Reveal>
            <article className="card card-hover flex h-full flex-col p-6 sm:p-8">
              <span className="eyebrow">No connection needed</span>
              <h3 className="mt-4 font-serif text-[1.75rem] leading-tight text-ink">
                Watch-only portfolios
              </h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">
                Add public wallet addresses and view their combined balances. Saved only in this
                browser, not linked onchain.
              </p>
              <ul className="mt-4 space-y-2 text-[0.9rem] text-ink-2 sm:mt-5 sm:space-y-2.5">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  Up to {MAX_WALLETS} wallets per portfolio
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  MON, stablecoins, supported memecoins and NFTs
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  Combined totals with a per-wallet breakdown
                </li>
              </ul>
              <Link href="/portfolio" className="btn btn-primary mt-6 self-start sm:mt-7">
                Open watch-only portfolio
                <Arrow />
              </Link>
            </article>
          </Reveal>

          {/* Verified ONE — equal quality, secondary CTA */}
          <Reveal delay={90}>
            <article className="card card-hover flex h-full flex-col p-6 sm:p-8">
              <span className="eyebrow text-accent-deep">Proves control</span>
              <h3 className="mt-4 font-serif text-[1.75rem] leading-tight text-ink">Verified ONE</h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">
                Link wallets you control and create one public identity that other apps can look up.
              </p>
              <ul className="mt-4 space-y-2 text-[0.9rem] text-ink-2 sm:mt-5 sm:space-y-2.5">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-deep" />
                  Each secondary wallet signs a gasless authorization
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-deep" />
                  The primary wallet completes one Monad Mainnet transaction
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-deep" />
                  No funds move and ONE never takes custody
                </li>
              </ul>
              <Link href="/verified" className="btn btn-ghost mt-6 self-start sm:mt-7">
                Create a Verified ONE
                <Arrow />
              </Link>
            </article>
          </Reveal>
        </div>
      </section>

      <MergeDivider />

      {/* ---------- Public identity + lookup ---------- */}
      <section id="identity" className="wrap py-9 sm:py-16">
        <Reveal className="max-w-[54ch]">
          <PageEyebrow>Public profile</PageEyebrow>
          <h2 className="display mt-4 text-balance text-[clamp(2rem,4vw,2.9rem)]">
            Look up any identity. <em>Share your own.</em>
          </h2>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-ink-2">
            The link is recorded on Monad Mainnet. Wallets can leave later, but the record that they
            were linked stays.
          </p>
        </Reveal>

        <div className="mt-8 grid items-start gap-5 sm:mt-10 lg:grid-cols-2 lg:gap-8">
          <Reveal>
            <p className="eyebrow mb-4">Example — a live Verified ONE</p>
            <IdentityCard
              address={EXAMPLE.address}
              primary={EXAMPLE.primary}
              secondary={EXAMPLE.secondary}
              linkedCount={EXAMPLE.linkedCount}
              profileHref={EXAMPLE.href}
            />
          </Reveal>
          <Reveal delay={90}>
            <OneLookup />
          </Reveal>
        </div>
      </section>

      <MergeDivider />

      {/* ---------- How it works / hard limits ---------- */}
      <section id="how-it-works" className="wrap py-9 pb-12 sm:py-16 sm:pb-24">
        <Reveal className="max-w-[52ch]">
          <PageEyebrow>How it works</PageEyebrow>
          <h2 className="display mt-4 text-balance text-[clamp(2rem,4vw,2.9rem)]">
            Three <em>hard limits</em>.
          </h2>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-ink-2">
            Everything ONE does is reading public data or asking for a signature. These limits hold
            in both modes.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:mt-10 sm:gap-5 md:grid-cols-3">
          <Reveal>
            <Guard
              index="01"
              label="KEYS"
              title="Never asks for a private key"
              body="Watch-only reads public Monad Mainnet data and needs no connection. A Verified ONE asks only for a signature, never a private key."
            />
          </Reveal>
          <Reveal delay={90}>
            <Guard
              index="02"
              label="FUNDS"
              title="Never moves funds"
              body="Creating a Verified ONE is signatures plus one transaction. No transfers, no token approvals, no custody at any point."
            />
          </Reveal>
          <Reveal delay={180}>
            <Guard
              index="03"
              label="CUSTODY"
              title="Never takes custody"
              body="The ONE identity address is not a wallet and holds nothing. Do not send funds to it."
            />
          </Reveal>
        </div>
      </section>
    </>
  );
}
