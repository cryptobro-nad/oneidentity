import type { Metadata } from "next";
import { MAX_MEMBERS, MIN_MEMBERS } from "@/lib/registry/members";
import { VerifiedClient } from "./VerifiedClient";

export const metadata: Metadata = {
  title: "Create a Verified ONE",
  description:
    "Prove that two to five Monad wallets belong together and create one public onchain identity.",
};

export default function VerifiedPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Create a Verified ONE
        </h1>
        <p className="mt-3 text-pretty text-muted">
          Prove that {MIN_MEMBERS} to {MAX_MEMBERS} wallets belong together. Each secondary wallet
          signs an authorization, then the primary submits one transaction that creates a public
          identity address.
        </p>
        <p className="mt-3 text-sm text-faint">
          ONE does not control or hold your funds. Wallet signatures authorize identity membership
          only.
        </p>
      </header>

      <VerifiedClient />
    </div>
  );
}
