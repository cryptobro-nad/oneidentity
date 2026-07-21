import Link from "next/link";
import { OneLookup } from "@/components/OneLookup";
import { Badge } from "@/components/ui/Badge";
import { MAX_WALLETS } from "@/lib/chain";
import { SUPPORTED_STABLECOINS } from "@/lib/tokens";

/**
 * The converging-wallets diagram from the product brief, drawn as real markup
 * rather than an image so it scales, respects the theme, and needs no assets.
 */
function ConvergenceDiagram() {
  const wallets = ["Wallet A", "Wallet B", "Wallet C"];
  return (
    <div
      className="rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8"
      role="img"
      aria-label="Three wallets converging into one combined view"
    >
      <p className="eyebrow">Combined view</p>
      <div className="mt-4 flex items-stretch gap-4 sm:gap-6">
        <ul className="flex flex-col justify-between gap-3 py-1">
          {wallets.map((w) => (
            <li
              key={w}
              className="rounded-[8px] border border-line bg-raised px-3 py-2 font-mono text-xs text-muted sm:text-sm"
            >
              {w}
            </li>
          ))}
        </ul>

        <div aria-hidden className="relative w-10 shrink-0 sm:w-16">
          <div className="absolute top-[16%] bottom-[16%] left-1/2 w-px bg-line-strong" />
          {["16%", "50%", "84%"].map((top) => (
            <div key={top} className="absolute left-0 h-px w-1/2 bg-line-strong" style={{ top }} />
          ))}
          <div className="absolute top-1/2 left-1/2 h-px w-1/2 bg-accent" />
          <div className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
        </div>

        <div className="flex flex-1 items-center">
          <div className="w-full rounded-[12px] border border-line bg-raised px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">ONE combined view</span>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              MON, stablecoins and NFT collection balances, added up — with a per-wallet breakdown.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function UseCard({
  eyebrow,
  tone,
  title,
  body,
  points,
  href,
  cta,
  primary,
}: {
  eyebrow: string;
  tone: "neutral" | "accent";
  title: string;
  body: string;
  points: string[];
  href: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-7">
      <Badge tone={tone === "accent" ? "accent" : "neutral"}>{eyebrow}</Badge>
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
          "mt-6 inline-flex items-center justify-center rounded-[8px] px-4 py-2.5 text-sm font-medium transition-colors " +
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
  const symbols = SUPPORTED_STABLECOINS.map((t) => t.symbol).join(", ");

  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
          <div>
            <Badge tone="neutral" dot>
              Built on Monad Mainnet
            </Badge>
            <h1 className="mt-5 text-4xl leading-[1.03] font-semibold tracking-[-0.035em] text-balance text-ink sm:text-6xl">
              Many wallets.
              <br />
              One view.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-pretty text-muted">
              See your MON, stablecoins and NFT collections across every Monad wallet in one place —
              and, when you need it, prove they&apos;re yours with a single onchain identity.
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
              Viewing needs no wallet connection, no signature, and writes nothing onchain.
            </p>
          </div>

          <ConvergenceDiagram />
        </div>
      </section>

      {/* Two ways to use ONE */}
      <section className="border-t border-line py-14 sm:py-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Two ways to use ONE</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Start read-only. Add cryptographic proof only when you actually need it.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <UseCard
            eyebrow="Watch-only · no connection"
            tone="neutral"
            title="Watch-only portfolios"
            body="Paste public addresses and read their combined onchain holdings. No wallet connection, no signature, nothing stored on a server."
            points={[
              `Up to ${MAX_WALLETS} addresses per portfolio`,
              `MON, ${symbols} and ERC-721 collections`,
              "Combined totals with a per-wallet breakdown",
            ]}
            href="/portfolio"
            cta="Open watch-only portfolio"
            primary
          />
          <UseCard
            eyebrow="Verified · proves control"
            tone="accent"
            title="Verified ONE"
            body="Prove you control two to five wallets and create one public identity address that other apps can resolve. Funds never move; ONE never takes custody."
            points={[
              "Each wallet signs a gasless authorization",
              "One transaction on Monad Mainnet",
              "A public identity address others can look up",
            ]}
            href="/verified"
            cta="Create a Verified ONE"
          />
        </div>
      </section>

      {/* Public lookup */}
      <section className="border-t border-line py-14">
        <OneLookup />
      </section>
    </div>
  );
}
