import type { Metadata } from "next";
import Link from "next/link";
import { PageEyebrow } from "@/components/ui/PageEyebrow";
import { Reveal } from "@/components/motion/Reveal";
import { MAX_WALLETS } from "@/lib/chain";
import { PortfolioClient } from "./PortfolioClient";

export const metadata: Metadata = {
  title: "Watch-only portfolios. ONE",
  description:
    "Track one to five public Monad wallet addresses and view their MON, stablecoins, supported memecoins and NFT balances. No wallet connection needed.",
};

export default function PortfolioPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 pt-10 pb-16 sm:px-8 sm:pt-14 sm:pb-20">
      <header className="mb-8 sm:mb-10">
        <Reveal>
          <PageEyebrow>Private, browser-saved</PageEyebrow>
          <h1 className="display mt-4 text-[clamp(2.4rem,5vw,3.4rem)]">
            Watch-only <em>portfolios</em>
          </h1>
          <p className="mt-5 max-w-2xl text-[1.02rem] leading-relaxed text-ink-2">
            Add a single wallet or up to {MAX_WALLETS}. One wallet shows that wallet&apos;s full
            balances. Several show combined totals with a per-wallet breakdown. No wallet connection
            or signature is required. Your portfolios are saved only in this browser and do not prove
            that you own the wallets.
          </p>
          <p className="mt-6 inline-flex flex-wrap items-center gap-x-4 gap-y-1.5 border-l border-line pl-3.5 font-mono text-[0.75rem] text-ink-3">
            <span>No wallet connection</span>
            <span aria-hidden className="text-line-strong">
              ·
            </span>
            <span>No signatures</span>
            <span aria-hidden className="text-line-strong">
              ·
            </span>
            <span>No transactions</span>
          </p>
        </Reveal>
      </header>

      <PortfolioClient />

      <Reveal
        as="section"
        className="mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-5 rounded-[18px] border border-line bg-surface p-6 sm:mt-16 sm:p-8"
      >
        <div className="max-w-xl">
          <span className="eyebrow text-accent-deep">Proves control</span>
          <h2 className="mt-3 font-serif text-[1.5rem] leading-tight text-ink">
            Want these wallets verified?
          </h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">
            This view is unverified. Anyone can type any address. A Verified ONE proves control by
            having each wallet sign, then records one public identity address onchain. No funds move.
          </p>
        </div>
        <Link href="/verified" className="btn btn-ghost shrink-0">
          Create a Verified ONE
        </Link>
      </Reveal>
    </div>
  );
}
