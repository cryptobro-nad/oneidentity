import type { Metadata } from "next";
import Link from "next/link";
import { MAX_WALLETS } from "@/lib/chain";
import { PortfolioClient } from "./PortfolioClient";

export const metadata: Metadata = {
  title: "Watch-only portfolios. ONE",
  description:
    "Track one to five public Monad wallet addresses and view their MON, stablecoins, supported memecoins and NFT balances. No wallet connection needed.",
};

export default function PortfolioPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-14">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink sm:text-4xl">
          Watch-only portfolios
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted">
          Add a single wallet or up to {MAX_WALLETS}. One wallet shows that wallet&apos;s full
          balances. Several show combined totals with a per-wallet breakdown. No wallet connection
          or signature is required. Your portfolios are saved only in this browser and do not prove
          that you own the wallets.
        </p>
      </header>

      <PortfolioClient />

      <section className="mt-12 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-t border-line pt-8">
        <div className="max-w-lg">
          <h2 className="text-lg font-semibold text-ink">Want these wallets verified?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            This view is unverified. Anyone can type any address. A Verified ONE proves control by
            having each wallet sign, then records one public identity address onchain. No funds
            move.
          </p>
        </div>
        <Link
          href="/verified"
          className="inline-flex shrink-0 items-center rounded-[8px] border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent-line hover:bg-raised"
        >
          Create a Verified ONE
        </Link>
      </section>
    </div>
  );
}
