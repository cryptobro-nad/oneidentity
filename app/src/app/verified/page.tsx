import type { Metadata } from "next";
import { PageEyebrow } from "@/components/ui/PageEyebrow";
import { Reveal } from "@/components/motion/Reveal";
import { MAX_MEMBERS, MIN_MEMBERS } from "@/lib/registry/members";
import { VerifiedClient } from "./VerifiedClient";

export const metadata: Metadata = {
  title: "Create a Verified ONE",
  description:
    "Link two to five Monad wallets you control and create one public identity that other apps can look up. No funds move and ONE never takes custody.",
};

const TRUST = [
  "Secondary wallets sign only",
  "Primary submits one transaction",
  "No funds move",
  "No token approvals",
  "ONE never takes custody",
];

export default function VerifiedPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16 sm:px-8 sm:pt-14 sm:pb-20">
      <header className="mb-9 sm:mb-11">
        <Reveal>
          <PageEyebrow>Verified ONE</PageEyebrow>
          <h1 className="display mt-4 text-[clamp(2.4rem,5vw,3.4rem)]">
            Create a <em>Verified ONE</em>
          </h1>
          <p className="mt-5 text-[1.02rem] leading-relaxed text-ink-2">
            Link {MIN_MEMBERS} to {MAX_MEMBERS} wallets you control and create one public identity for
            them. Each secondary wallet signs a gasless authorization to join. The primary wallet then
            completes one transaction on Monad Mainnet.
          </p>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-3">
            No funds move, no token approvals are requested, and ONE never takes custody. A signature
            here only confirms that the wallet agrees to join.
          </p>

          <ul className="mt-7 grid gap-2 sm:grid-cols-2">
            {TRUST.map((t) => (
              <li
                key={t}
                className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 font-mono text-[0.76rem] text-ink-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <path d="M3 8.5l3 3 7-7.5" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </Reveal>
      </header>

      <VerifiedClient />
    </div>
  );
}
