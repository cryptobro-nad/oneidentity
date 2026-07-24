"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useWallet } from "@/lib/wallet/useWallet";
import { monad } from "@/lib/chain";
import { ONE_REGISTRY_V2_ADDRESS, ONE_REGISTRY_V2_WRITE_ABI } from "@/lib/v2link/registry";
import { V2_LINK_COPY, type LinkFlowState } from "@/lib/v2link/copy";
import { formatAmount, shortenAddress } from "@/lib/format";

type ChallengeResp = { id: string; primary: string; secondary: string; amountWei: string; expiresAt: number };
type Attestation = {
  primary: `0x${string}`;
  secondary: `0x${string}`;
  one: `0x${string}`;
  challengeId: `0x${string}`;
  amount: string;
  txHash: `0x${string}`;
  txBlock: string;
  deadline: string;
  verifierNonce: string;
};
type StatusResp = { status: string; attestation?: Attestation; signature?: `0x${string}` };

/**
 * The single visible V2 linking method. The secondary never connects to ONE:
 * the user sends MON from it to their own primary, the backend detects the
 * transfer, and the connected primary submits the on-chain approval.
 */
export function LinkWalletV2() {
  const wallet = useWallet();
  const [secondary, setSecondary] = useState("");
  const [state, setState] = useState<LinkFlowState>("idle");
  const [challenge, setChallenge] = useState<ChallengeResp | null>(null);
  const [verified, setVerified] = useState<StatusResp | null>(null);
  const [linkedOne, setLinkedOne] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(ONE_REGISTRY_V2_ADDRESS);

  const startLink = useCallback(async () => {
    setError(null);
    if (!wallet.address) return setError("Connect your primary wallet first.");
    if (!isAddress(secondary, { strict: false })) return setError("Enter a valid secondary wallet address.");
    if (getAddress(secondary) === wallet.address) return setError("Use a wallet other than the primary.");
    setState("creatingChallenge");
    try {
      const res = await fetch("/api/v2/link/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ primary: wallet.address, secondary: getAddress(secondary) }),
      });
      const data = (await res.json()) as ChallengeResp & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not start the link.");
        return setState("error");
      }
      setChallenge(data);
      setState("awaitingTransfer");
    } catch {
      setError("Network error, please try again.");
      setState("error");
    }
  }, [wallet.address, secondary]);

  // Poll for the detected transfer while awaiting.
  useEffect(() => {
    if (!challenge || (state !== "awaitingTransfer" && state !== "checking")) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/v2/link/challenge/${challenge.id}`);
        const data = (await res.json()) as StatusResp;
        if (cancelled) return;
        if (data.status === "verified" && data.attestation && data.signature) {
          setVerified(data);
          setState("verified");
        } else if (data.status === "expired") {
          setState("expired");
        }
      } catch {
        /* transient; keep polling */
      }
    };
    void tick();
    const iv = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [challenge, state]);

  const approve = useCallback(async () => {
    if (!verified?.attestation || !verified.signature || !ONE_REGISTRY_V2_ADDRESS) return;
    setError(null);
    setState("approving");
    try {
      await wallet.ensureOnMonad();
      const wc = wallet.getWalletClient();
      if (!wc || !wallet.address) throw new Error("Connect your primary wallet.");
      const a = verified.attestation;
      const att = {
        primary: a.primary,
        secondary: a.secondary,
        one: a.one,
        challengeId: a.challengeId,
        amount: BigInt(a.amount),
        txHash: a.txHash,
        txBlock: BigInt(a.txBlock),
        deadline: BigInt(a.deadline),
        verifierNonce: BigInt(a.verifierNonce),
      };
      await wc.writeContract({
        address: ONE_REGISTRY_V2_ADDRESS,
        abi: ONE_REGISTRY_V2_WRITE_ABI,
        functionName: "approveLink",
        args: [att, verified.signature],
        account: wallet.address,
        chain: monad,
      });
      setLinkedOne(a.one);
      setState("linked");
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Approval failed.");
      setState("verified");
    }
  }, [verified, wallet]);

  const reset = useCallback(() => {
    setChallenge(null);
    setVerified(null);
    setError(null);
    setState("idle");
  }, []);

  const amountLabel = useMemo(
    () => (challenge ? formatAmount(BigInt(challenge.amountWei), 18, 6) : ""),
    [challenge],
  );

  return (
    <section className="space-y-5 rounded-[16px] border border-line bg-surface p-5 sm:p-6">
      <div>
        <h3 className="font-serif text-[1.3rem] leading-tight text-ink">Link a wallet</h3>
        <p className="mt-2 max-w-[62ch] text-[0.9rem] leading-relaxed text-ink-2">{V2_LINK_COPY.fundsNote}</p>
        <p className="mt-1 text-[0.78rem] text-ink-3">{V2_LINK_COPY.secondaryNeverConnects}</p>
      </div>

      {!configured ? (
        <p className="text-sm text-warn">Linking is not enabled on this deployment yet.</p>
      ) : state === "linked" ? (
        <div className="rounded-[12px] border border-success/40 bg-success-soft px-4 py-3">
          <p className="text-sm font-medium text-ink">{V2_LINK_COPY.linked}</p>
          <p className="mt-1 font-mono text-[0.72rem] text-ink-3">into {shortenAddress(linkedOne ?? "")}</p>
          <button type="button" onClick={reset} className="mt-3 btn btn-quiet">
            Link another wallet
          </button>
        </div>
      ) : (
        <>
          <label className="block">
            <span className="text-[0.78rem] text-ink-3">{V2_LINK_COPY.enterSecondary}</span>
            <input
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              placeholder="0x…"
              disabled={state !== "idle" && state !== "error"}
              className="mt-1 w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-ink"
            />
          </label>

          {state === "idle" || state === "error" || state === "expired" ? (
            <button type="button" onClick={startLink} className="btn btn-primary" disabled={!wallet.address}>
              {V2_LINK_COPY.linkWallet}
            </button>
          ) : null}

          {(state === "awaitingTransfer" || state === "checking") && challenge ? (
            <div className="rounded-[12px] border border-line bg-surface-2/40 px-4 py-3">
              <p className="text-sm text-ink">
                Send exactly{" "}
                <span className="tnum font-semibold">{amountLabel} MON</span> from{" "}
                <span className="font-mono">{shortenAddress(challenge.secondary)}</span> to your primary{" "}
                <span className="font-mono">{shortenAddress(challenge.primary)}</span>.
              </p>
              <p className="mt-1 text-[0.78rem] text-ink-3">{V2_LINK_COPY.checking}</p>
            </div>
          ) : null}

          {state === "verified" ? (
            <div className="rounded-[12px] border border-accent/40 bg-surface-2/40 px-4 py-3">
              <p className="text-sm text-ink">{V2_LINK_COPY.transferConfirmed}</p>
              <button type="button" onClick={approve} className="mt-3 btn btn-primary">
                {V2_LINK_COPY.approveWithPrimary}
              </button>
            </div>
          ) : null}

          {state === "approving" ? <p className="text-sm text-ink-3">Confirm the approval in your wallet…</p> : null}
          {state === "expired" ? <p className="text-sm text-warn">{V2_LINK_COPY.expired}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </>
      )}
    </section>
  );
}
