import type { Metadata } from "next";
import { MAX_MEMBERS, MIN_MEMBERS } from "@/lib/registry/members";
import { VerifiedClient } from "./VerifiedClient";

export const metadata: Metadata = {
  title: "Create a Verified ONE",
  description:
    "Link two to five Monad wallets you control and create one public identity that other apps can look up. No funds move and ONE never takes custody.",
};

export default function VerifiedPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink sm:text-4xl">
          Create a Verified ONE
        </h1>
        <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted">
          Link {MIN_MEMBERS} to {MAX_MEMBERS} wallets you control and create one public identity for
          them. Each secondary wallet signs a gasless authorization to join. The primary wallet then
          completes one transaction on Monad Mainnet.
        </p>
        <p className="mt-3 text-sm text-faint">
          No funds move, no token approvals are requested, and ONE never takes custody. A signature
          here only confirms that the wallet agrees to join.
        </p>
      </header>

      <VerifiedClient />
    </div>
  );
}
