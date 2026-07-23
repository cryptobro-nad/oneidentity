import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Instrument_Sans,
  Instrument_Serif,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/**
 * Applied before first paint: sets data-theme from the stored choice, else the
 * system preference. Prevents any incorrect-theme flash. Kept tiny and inline.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('one-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL("https://oneidentity.app"),
  title: "ONE. Multiple wallets. One view.",
  description:
    "Track your MON, stablecoins, supported memecoins and NFTs across up to five Monad wallets.",
  openGraph: {
    title: "ONE. Multiple wallets. One view.",
    description:
      "Track your MON, stablecoins, supported memecoins and NFTs across up to five Monad wallets. Keep it watch-only or create a Verified ONE to prove the wallets belong to you.",
    url: "https://oneidentity.app",
    siteName: "ONE",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <SiteHeader />
        <main className="relative z-[1] flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
