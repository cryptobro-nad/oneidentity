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
  title: "ONE — Many wallets. One view.",
  description:
    "View your MON, stablecoins and NFT collection holdings across multiple Monad wallets.",
  openGraph: {
    title: "ONE — Many wallets. One onchain identity.",
    description:
      "Combine MON, stablecoins and NFT holdings across multiple Monad wallets, or create one public onchain identity.",
    url: "https://oneidentity.app",
    siteName: "ONE",
    type: "website",
  },
};

function Wordmark() {
  return (
    <Link href="/" className="group inline-flex items-baseline gap-2" aria-label="ONE — home">
      <span className="text-xl font-semibold tracking-[-0.04em] text-ink">ONE</span>
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
        <header className="border-b border-line">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
            <Wordmark />
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/portfolio" className="text-muted transition-colors hover:text-ink">
                Portfolio
              </Link>
              <Link href="/verified" className="text-muted transition-colors hover:text-ink">
                Verified ONE
              </Link>
              <span className="hidden items-center gap-2 text-faint sm:flex">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent/60" />
                Monad Mainnet
              </span>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line">
          <div className="mx-auto w-full max-w-5xl px-5 py-8 text-xs text-faint sm:px-8">
            <p>
              ONE reads public Monad Mainnet data. It never asks for a wallet connection, a
              signature, or a private key.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
