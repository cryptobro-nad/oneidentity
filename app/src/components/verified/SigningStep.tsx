"use client";

import { AddressChip } from "@/components/AddressChip";
import { Badge } from "@/components/ui/Badge";
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
        <h2 id="signing-heading" className="text-lg font-semibold tracking-[-0.01em] text-ink">
          2. Sign with each wallet
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Each secondary wallet signs a gasless authorization to join this ONE. The primary wallet
          does not sign. It confirms the group by submitting the transaction.
        </p>
        {deadline ? (
          <p className="mt-1.5 text-sm text-faint">
            Signatures expire at <span className="text-muted">{formatTimestamp(deadline)}</span>.
          </p>
        ) : null}
      </div>

      <div className="rounded-[12px] border border-line bg-raised px-4 py-3">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">Signing does not move funds or approve tokens.</span>{" "}
          It only records that the wallet agrees to join this ONE. ONE never takes custody.
        </p>
      </div>

      <ul className="space-y-3">
        {secondaries.map((wallet) => {
          const status = signatureStatusFor(draft, wallet);
          const isConnected = sameAddress(connectedAddress, wallet);
          const busy = signing !== null && sameAddress(signing, wallet);

          return (
            <li key={wallet} className="rounded-[12px] border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <AddressChip address={wallet} />
                  <p className="mt-1 text-xs">
                    {status.state === "valid" ? (
                      <span className="text-accent">Signed · nonce {status.signature.nonce}</span>
                    ) : status.state === "expired" ? (
                      <span className="text-danger">Signature expired. Sign again.</span>
                    ) : status.state === "stale-config" ? (
                      <span className="text-danger">
                        The wallet list changed, so this signature is no longer valid.
                      </span>
                    ) : (
                      <span className="text-faint">Not signed yet</span>
                    )}
                  </p>
                </div>

                {status.state === "valid" ? (
                  <Badge tone="accent">Done</Badge>
                ) : isConnected ? (
                  <button
                    type="button"
                    onClick={() => onSign(wallet)}
                    // Not gated on the (possibly stale) network: pressing Sign
                    // re-reads the chain live and requests the switch if needed,
                    // so a wallet already on Monad is never blocked by old state.
                    disabled={busy}
                    className="rounded-[8px] bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-colors hover:brightness-110 disabled:opacity-50"
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

              {/* Off Monad but the right wallet: signing will prompt the switch. */}
              {isConnected && !isOnMonad && status.state !== "valid" ? (
                <p className="mt-2 text-xs text-warn">
                  Your wallet is on another network. Signing will ask it to switch to Monad
                  Mainnet first.
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
