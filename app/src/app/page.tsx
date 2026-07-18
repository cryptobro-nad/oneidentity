import Link from "next/link";
import { MAX_WALLETS } from "@/lib/chain";
import { SUPPORTED_STABLECOINS } from "@/lib/tokens";

/**
 * The converging-wallets diagram from the product brief, drawn as real markup
 * rather than an image so it scales, respects the theme, and needs no assets.
 *
 *   Wallet A ─┐
 *   Wallet B ─┼── ONE combined view
 *   Wallet C ─┘
 */
function ConvergenceDiagram() {
  const wallets = ["Wallet A", "Wallet B", "Wallet C"];
  return (
    <div
      className="rounded-2xl border border-line bg-surface p-6 sm:p-8"
      role="img"
      aria-label="Three wallets converging into one combined view"
    >
      <div className="flex items-stretch gap-4 sm:gap-6">
        <ul className="flex flex-col justify-between gap-3 py-1">
          {wallets.map((w) => (
            <li
              key={w}
              className="rounded-lg border border-line bg-raised px-3 py-2 font-mono text-xs text-muted sm:text-sm"
            >
              {w}
            </li>
          ))}
        </ul>

        {/* Connector: three stubs joining a spine that feeds the combined card. */}
        <div aria-hidden className="relative w-10 shrink-0 sm:w-16">
          <div className="absolute top-[16%] bottom-[16%] left-1/2 w-px bg-line-strong" />
          {["16%", "50%", "84%"].map((top) => (
            <div key={top} className="absolute left-0 h-px w-1/2 bg-line-strong" style={{ top }} />
          ))}
          <div className="absolute top-1/2 left-1/2 h-px w-1/2 bg-accent" />
          <div className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
        </div>

        <div className="flex flex-1 items-center">
          <div className="w-full rounded-xl border border-accent/30 bg-accent-soft px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-xs tracking-wide text-accent uppercase">ONE combined view</p>
            <p className="mt-2 text-sm text-muted">
              MON, stablecoins and NFT collection balances, added up.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const symbols = SUPPORTED_STABLECOINS.map((t) => t.symbol).join(", ");

  return (
    <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
      <section className="py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
          <div>
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-ink sm:text-6xl">
              Many wallets.
              <br />
              One view.
            </h1>

            <p className="mt-6 max-w-md text-lg leading-relaxed text-pretty text-muted">
              View your MON, stablecoins and NFT collection holdings across multiple Monad
              wallets.
            </p>

            <div className="mt-9">
              <Link
                href="/portfolio"
                className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
              >
                View my wallets together
              </Link>
            </div>

            <p className="mt-5 text-sm text-faint">
              No connection. No signatures. Nothing is written onchain.
            </p>
          </div>

          <ConvergenceDiagram />
        </div>
      </section>

      <section className="border-t border-line py-12">
        <dl className="grid gap-8 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-ink">Up to {MAX_WALLETS} wallets</dt>
            <dd className="mt-1.5 text-sm text-muted">
              Paste the addresses you want to see together. Nothing is stored on a server.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-ink">MON and {symbols}</dt>
            <dd className="mt-1.5 text-sm text-muted">
              Live balances read straight from Monad Mainnet at a single block.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-ink">NFT collection checks</dt>
            <dd className="mt-1.5 text-sm text-muted">
              Enter an ERC-721 collection to see the combined balance across your wallets.
            </dd>
          </div>
        </dl>
      </section>

      <section className="border-t border-line py-12 sm:py-16">
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-lg">
              <h2 className="text-lg font-medium text-ink">
                Need to prove the wallets are yours?
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                Verified ONE will let you sign from each wallet and create one public identity
                address.
              </p>
            </div>

            <div className="flex flex-col items-start gap-2">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-2.5 rounded-full border border-line bg-raised px-5 py-2.5 text-sm text-faint"
              >
                Create a Verified ONE
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                  Coming next
                </span>
              </button>
              <p className="text-xs text-faint">Not available yet.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
