"use client";

import { useState } from "react";
import { MAX_MEMBERS, MIN_MEMBERS } from "@/lib/registry/members";
import { VerifiedClient } from "./VerifiedClient";
import { VerifiedV2Panel } from "@/components/verified/VerifiedV2Panel";

type Mode = "sign" | "transfer";

const V1_TRUST = [
  "Secondary wallets sign only",
  "Primary submits one transaction",
  "No funds move",
  "No token approvals",
  "ONE never takes custody",
];

/**
 * Lets the user choose how to build their identity, keeping the two methods
 * clearly distinct so their different trust framing never blurs:
 *  - "sign"     — the original method: each wallet signs a gasless authorization.
 *  - "transfer" — link a wallet by sending a small amount of MON to the primary;
 *                 the secondary never connects. A small amount does move here.
 */
export function VerifiedModeSwitch() {
  const [mode, setMode] = useState<Mode>("sign");

  return (
    <div className="space-y-8">
      <div
        role="tablist"
        aria-label="How to build your identity"
        className="grid grid-cols-2 gap-2 rounded-[12px] border border-line bg-surface p-1.5"
      >
        <ModeTab active={mode === "sign"} onClick={() => setMode("sign")} title="Link by signing">
          Each wallet signs
        </ModeTab>
        <ModeTab active={mode === "transfer"} onClick={() => setMode("transfer")} title="Link by transfer">
          Link by transfer
        </ModeTab>
      </div>

      {mode === "sign" ? (
        <div className="space-y-9">
          <div>
            <p className="text-[1.02rem] leading-relaxed text-ink-2">
              Link {MIN_MEMBERS} to {MAX_MEMBERS} wallets you control and create one public identity for
              them. Each secondary wallet signs a gasless authorization to join. The primary wallet then
              completes one transaction on Monad Mainnet.
            </p>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-3">
              No funds move, no token approvals are requested, and ONE never takes custody. A signature
              here only confirms that the wallet agrees to join.
            </p>
            <ul className="mt-7 grid gap-2 sm:grid-cols-2">
              {V1_TRUST.map((t) => (
                <li
                  key={t}
                  className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 font-mono text-[0.76rem] text-ink-2"
                >
                  <Check />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <VerifiedClient />
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-[1.02rem] leading-relaxed text-ink-2">
            Link a wallet without connecting it. You send a small amount of MON from that wallet to your
            primary wallet, and ONE confirms it for you. Only your primary wallet connects here.
          </p>
          <VerifiedV2Panel />
        </div>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={title}
      onClick={onClick}
      className={`rounded-[9px] px-3 py-2 text-[0.85rem] font-medium transition-colors ${
        active ? "bg-accent-soft text-accent" : "text-ink-3 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Check() {
  return (
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
  );
}
