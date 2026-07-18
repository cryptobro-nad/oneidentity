import type { Metadata } from "next";
import { MAX_WALLETS } from "@/lib/chain";
import { PortfolioClient } from "./PortfolioClient";

export const metadata: Metadata = {
  title: "Personal portfolio — ONE",
  description:
    "Combine up to five Monad wallets into one unverified view of MON, stablecoins and NFT collection balances.",
};

export default function PortfolioPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Personal portfolio
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-muted">
          Enter up to {MAX_WALLETS} Monad Mainnet addresses to see their combined balances. No
          wallet connection, no signatures, and nothing is written onchain.
        </p>
      </header>

      <PortfolioClient />
    </div>
  );
}
