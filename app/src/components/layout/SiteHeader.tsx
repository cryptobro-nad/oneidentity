"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OneLogo } from "@/components/brand/OneLogo";
import { StatusPill } from "@/components/ui/StatusPill";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const NAV = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/verified", label: "Verified ONE" },
  { href: "/#how-it-works", label: "How it works" },
] as const;

/**
 * Global header: sticky, translucent with a backdrop blur, a hairline that
 * appears once the page scrolls, the ONE brand mark, real navigation, the
 * network status pill and the theme toggle. Nav links move to a second row on
 * small screens rather than disappearing.
 */
export function SiteHeader() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b backdrop-blur-[18px] backdrop-saturate-[1.6] transition-[border-color,background] duration-300 ${
        stuck ? "border-line" : "border-transparent"
      }`}
      style={{ background: "var(--header-bg)" }}
    >
      <div className="wrap">
        <div className="flex h-[70px] items-center gap-5">
          <Link href="/" aria-label="ONE home" className="shrink-0">
            <OneLogo size={29} wordmarkSize="1.56rem" />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-[8px] px-[13px] py-[7px] text-[0.9rem] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <StatusPill />
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile navigation row */}
        <nav
          className="flex items-center gap-1 border-t border-line py-2 md:hidden"
          aria-label="Primary"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-[8px] px-2.5 py-1.5 text-[0.85rem] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
