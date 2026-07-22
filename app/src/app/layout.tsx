import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Production origin, used only to resolve relative metadata URLs into
  // absolute ones for link previews. Runtime links are never built from this —
  // the profile-link copy uses window.location.origin so it stays correct on
  // localhost and preview deployments.
  metadataBase: new URL("https://oneidentity.app"),
  title: "ONE. Many wallets. One view.",
  description:
    "Track your MON, stablecoins, supported memecoins and NFTs across up to five Monad wallets.",
  openGraph: {
    title: "ONE. Many wallets. One view.",
    description:
      "Track your MON, stablecoins, supported memecoins and NFTs across up to five Monad wallets. Keep it watch-only or create a Verified ONE to prove the wallets belong to you.",
    url: "https://oneidentity.app",
    siteName: "ONE",
    type: "website",
  },
};

function Wordmark() {
  return (
    <Link href="/" className="group inline-flex items-baseline gap-1.5" aria-label="ONE home">
      <span className="text-lg font-semibold tracking-[-0.03em] text-ink">ONE</span>
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-accent transition-transform group-hover:scale-125"
      />
    </Link>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
            <div className="flex items-center gap-7">
              <Wordmark />
              <nav className="hidden items-center gap-6 text-sm sm:flex">
                <Link href="/portfolio" className="text-muted transition-colors hover:text-ink">
                  Portfolio
                </Link>
                <Link href="/verified" className="text-muted transition-colors hover:text-ink">
                  Verified ONE
                </Link>
              </nav>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-xs text-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
              Monad Mainnet
            </span>
          </div>
          <nav className="flex items-center gap-6 border-t border-line px-5 py-2 text-sm sm:hidden">
            <Link href="/portfolio" className="text-muted transition-colors hover:text-ink">
              Portfolio
            </Link>
            <Link href="/verified" className="text-muted transition-colors hover:text-ink">
              Verified ONE
            </Link>
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-16 border-t border-line bg-raised">
          <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-md">
                <Link
                  href="/"
                  className="group inline-flex items-baseline gap-1.5"
                  aria-label="ONE home"
                >
                  <span className="text-xl font-semibold tracking-[-0.03em] text-ink">ONE</span>
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full bg-accent transition-transform group-hover:scale-125"
                  />
                </Link>
                <p className="mt-3 text-xs leading-relaxed text-faint">
                  ONE reads public Monad Mainnet data. It never asks for a wallet connection, a
                  signature, or a private key to view balances, and never takes custody of any
                  assets.
                </p>
              </div>
              <nav className="flex flex-col gap-2.5 text-sm sm:items-end" aria-label="Footer">
                <Link href="/portfolio" className="text-muted transition-colors hover:text-ink">
                  Portfolio
                </Link>
                <Link href="/verified" className="text-muted transition-colors hover:text-ink">
                  Verified ONE
                </Link>
              </nav>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
