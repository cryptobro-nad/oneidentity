import type { Metadata } from "next";
import Link from "next/link";
import { MAX_WALLETS } from "@/lib/chain";
import { PortfolioClient } from "./PortfolioClient";

export const metadata: Metadata = {
  title: "Watch-only portfolios — ONE",
  description:
    "Private browser watchlists of one to five Monad wallets, showing MON, stablecoins, curated community tokens and NFT collection balances.",
};

export default function PortfolioPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-14">
      <header className="mb-9">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink sm:text-4xl">
          Watch-only portfolios
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted">
          Add a single wallet or up to {MAX_WALLETS}. One wallet gets that wallet&apos;s complete
          supported balance view; several are shown as combined totals with a per-wallet breakdown.
          No wallet connection or signature is required — these are private watchlists saved in this
          browser that read public onchain data and do not prove ownership of the wallets in them.
        </p>
      </header>

      <PortfolioClient />

      <section className="mt-14 border-t border-line pt-10">
        <div className="flex flex-wrap items-start justify-between gap-5 rounded-[16px] border border-line bg-raised p-6 sm:p-7">
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold text-ink">Want these wallets verified?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              This view is unverified — anyone can type any address. A Verified ONE proves control
              by having each wallet sign, then records one public identity address onchain. Funds
              never move.
            </p>
          </div>
          <Link
            href="/verified"
            className="inline-flex items-center rounded-[8px] border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            Create a Verified ONE
          </Link>
        </div>
      </section>
    </div>
  );
}
