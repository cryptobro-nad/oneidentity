import Link from "next/link";
import { OneLogo } from "@/components/brand/OneLogo";
import { StatusPill } from "@/components/ui/StatusPill";

const REPO_URL = "https://github.com/cryptobro-nad/oneidentity";
const SITE_URL = "https://oneidentity.app";

type FootLink = { href: string; label: string; external?: boolean };

function FootCol({ title, links }: { title: string; links: FootLink[] }) {
  return (
    <div>
      <h2 className="mb-4 font-mono text-[0.66rem] font-normal tracking-[0.15em] text-ink-3 uppercase">
        {title}
      </h2>
      <ul className="space-y-0">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              {...(l.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
              className="inline-block py-[5px] text-[0.9rem] text-ink-2 transition-[color,transform] hover:translate-x-[3px] hover:text-ink"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Global footer. Reference styling, truthful content: only real routes and real
 * project links. No fake docs/social links, no static block number, no invented
 * legal pages.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-[1] mt-5 border-t border-line bg-surface">
      <div className="wrap">
        <div className="grid grid-cols-1 gap-9 py-12 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr] md:py-14">
          <div>
            <Link href="/" aria-label="ONE home" className="inline-flex">
              <OneLogo />
            </Link>
            <p className="mt-[18px] max-w-[34ch] text-[0.875rem] text-ink-2">
              Many wallets, one view. Built on public Monad Mainnet data, with no custody of any
              assets.
            </p>
          </div>
          <FootCol
            title="Product"
            links={[
              { href: "/portfolio", label: "Watch-only Portfolio" },
              { href: "/verified", label: "Verified ONE" },
              { href: "/#identity", label: "Look up an identity" },
            ]}
          />
          <FootCol
            title="Project"
            links={[
              { href: REPO_URL, label: "GitHub", external: true },
              { href: SITE_URL, label: "Live site", external: true },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-[18px] font-mono text-[0.73rem] text-ink-3">
          <span>Many wallets. One view.</span>
          <StatusPill className="!bg-transparent" />
          <span>Never asks for a private key</span>
        </div>
      </div>
    </footer>
  );
}
