"use client";

import { AddressChip } from "@/components/AddressChip";
import { formatTimestamp, shortenAddress } from "@/lib/format";
import { signatureStatusFor, type OneDraft } from "@/lib/registry/draft";
import { secondariesInOrder, sameAddress } from "@/lib/registry/members";
import type { PortfolioAddress } from "@/lib/types";

export function SigningStep({
  draft,
  connectedAddress,
  isOnMonad,
  signing,
  onSign,
  error,
}: {
  draft: OneDraft;
  connectedAddress: PortfolioAddress | null;
  isOnMonad: boolean;
  signing: PortfolioAddress | null;
  onSign: (wallet: PortfolioAddress) => void;
  error: string | null;
}) {
  if (!draft.primary || draft.members.length < 2) return null;

  const secondaries = secondariesInOrder(draft.members, draft.primary);
  const deadline = draft.deadline ? Number(draft.deadline) * 1000 : null;

  return (
    <section aria-labelledby="signing-heading" className="space-y-5">
      <div>
        <h2 id="signing-heading" className="text-lg font-medium text-ink">
          2. Collect signatures
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Each secondary wallet signs an authorization. The primary does not sign — it proves
          intent by submitting the transaction.
        </p>
        {deadline ? (
          <p className="mt-1.5 text-sm text-faint">
            Signatures expire at <span className="text-muted">{formatTimestamp(deadline)}</span>.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-line bg-raised px-4 py-3">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">
            Wallet signatures authorize identity membership only.
          </span>{" "}
          ONE does not control or hold your funds. A signature here cannot move or approve any
          asset.
        </p>
      </div>

      <ul className="space-y-3">
        {secondaries.map((wallet) => {
          const status = signatureStatusFor(draft, wallet);
          const isConnected = sameAddress(connectedAddress, wallet);
          const busy = signing !== null && sameAddress(signing, wallet);

          return (
            <li key={wallet} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <AddressChip address={wallet} />
                  <p className="mt-1 text-xs">
                    {status.state === "valid" ? (
                      <span className="text-accent">Signed · nonce {status.signature.nonce}</span>
                    ) : status.state === "expired" ? (
                      <span className="text-danger">Signature expired — must sign again</span>
                    ) : status.state === "stale-config" ? (
                      <span className="text-danger">
                        Configuration changed — signature no longer valid
                      </span>
                    ) : (
                      <span className="text-faint">Not signed yet</span>
                    )}
                  </p>
                </div>

                {status.state === "valid" ? (
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                    Done
                  </span>
                ) : isConnected ? (
                  <button
                    type="button"
                    onClick={() => onSign(wallet)}
                    disabled={!isOnMonad || busy}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Waiting for wallet…" : "Sign with this wallet"}
                  </button>
                ) : (
                  <span className="text-xs text-warn">
                    Connect {shortenAddress(wallet)} to sign
                  </span>
                )}
              </div>

              {/* The flow never auto-advances on the wrong wallet. */}
              {!isConnected && status.state !== "valid" ? (
                <p className="mt-2 text-xs text-faint">
                  Switch the active account in your wallet to this address. ONE will not sign on
                  behalf of any wallet.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
