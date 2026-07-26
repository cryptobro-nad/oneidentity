"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { useWallet } from "@/lib/wallet/useWallet";
import { monad, PRIMARY_RPC } from "@/lib/chain";
import { ONE_REGISTRY_V2_ADDRESS, ONE_REGISTRY_V2_WRITE_ABI } from "@/lib/v2link/registry";
import { AMOUNT_DECIMALS } from "@/lib/v2link/challenge";
import { V2_LINK_COPY, formatCountdown, type LinkFlowState } from "@/lib/v2link/copy";
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
type StatusResp = {
  status: string;
  attestation?: Attestation;
  signature?: `0x${string}`;
  approvalDeadline?: number;
  error?: string;
};

const publicClient = createPublicClient({ chain: monad, transport: http(PRIMARY_RPC) });

/** True if the wallet rejected the request (rather than the tx reverting). */
function isUserRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
  return msg.includes("rejected") || msg.includes("denied") || msg.includes("4001");
}

/**
 * The single visible V2 linking method. The secondary never connects to ONE:
 * the user sends MON from it to their own primary, ONE detects the transfer,
 * and the connected primary submits the on-chain approval.
 *
 * `wallet` is the SHARED wallet instance from the parent — never call useWallet()
 * here, or this component gets its own disconnected copy and its button stays
 * disabled even after the user connects in the panel.
 */
export function LinkWalletV2({
  wallet,
  onLinked,
}: {
  wallet: ReturnType<typeof useWallet>;
  onLinked?: (one: string) => void;
}) {
  const [secondary, setSecondary] = useState("");
  const [state, setState] = useState<LinkFlowState>("idle");
  const [challenge, setChallenge] = useState<ChallengeResp | null>(null);
  const [verified, setVerified] = useState<StatusResp | null>(null);
  const [linkedOne, setLinkedOne] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Bumping this re-runs the status-poll effect immediately (a manual check).
  const [checkNonce, setCheckNonce] = useState(0);

  const configured = Boolean(ONE_REGISTRY_V2_ADDRESS);
  const nowSec = Math.floor(nowMs / 1000);

  // A once-per-second clock drives the countdowns and also expires the open
  // window (the server expires independently too). Only runs while a window is
  // open; the setState calls live in the timer callback, not the effect body.
  useEffect(() => {
    const windowOpen =
      state === "awaitingTransfer" || state === "checking" || state === "verified" || state === "approving";
    if (!windowOpen) return;
    const iv = setInterval(() => {
      const sec = Math.floor(Date.now() / 1000);
      setNowMs(Date.now());
      if ((state === "awaitingTransfer" || state === "checking") && challenge && sec >= challenge.expiresAt) {
        setState("expired");
      } else if (
        (state === "verified" || state === "approving") &&
        verified?.approvalDeadline !== undefined &&
        sec >= verified.approvalDeadline
      ) {
        setState("approvalExpired");
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [state, challenge, verified]);

  const startLink = useCallback(async () => {
    setError(null);
    if (!wallet.address) return setError("Connect your primary wallet first.");
    if (!isAddress(secondary, { strict: false })) return setError("Enter a valid wallet address to link.");
    if (getAddress(secondary) === wallet.address) return setError("Use a wallet other than the primary.");
    // Each fresh attempt clears any previous verified/expired state so the amount
    // and window are always new (never a stale amount from an expired attempt).
    setChallenge(null);
    setVerified(null);
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
      setNowMs(Date.now());
      setState("awaitingTransfer");
    } catch {
      setError("Network problem. Please try again.");
      setState("error");
    }
  }, [wallet.address, secondary]);

  // Poll for the detected transfer while awaiting / checking.
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
          setNowMs(Date.now());
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
    // checkNonce is a dependency so the "check now" button fires an immediate tick.
  }, [challenge, state, checkNonce]);

  const checkNow = useCallback(() => {
    setState("checking");
    setCheckNonce((n) => n + 1);
  }, []);

  const approve = useCallback(async () => {
    if (!verified?.attestation || !verified.signature || !ONE_REGISTRY_V2_ADDRESS || !challenge) return;
    setError(null);

    // The connected wallet must still be the primary that started the attempt.
    const live = await wallet.refreshAccount();
    if (!live || getAddress(live) !== getAddress(challenge.primary)) {
      setError(V2_LINK_COPY.wrongPrimary);
      return;
    }
    if (!(await wallet.ensureOnMonad())) {
      setError(V2_LINK_COPY.wrongNetwork);
      return;
    }

    setState("approving");
    try {
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
      const hash = await wc.writeContract({
        address: ONE_REGISTRY_V2_ADDRESS,
        abi: ONE_REGISTRY_V2_WRITE_ABI,
        functionName: "approveLink",
        args: [att, verified.signature],
        account: wallet.address,
        chain: monad,
      });
      // Wait for the approval to land so we only report success once it's final.
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("reverted");
      // Mark the challenge linked so a later link of the SAME pair starts fresh
      // instead of resuming this now-consumed approval. Best effort — the
      // on-chain link is the source of truth.
      void fetch(`/api/v2/link/challenge/${challenge.id}`, { method: "POST" }).catch(() => {});
      setLinkedOne(a.one);
      setState("linked");
      onLinked?.(a.one);
    } catch (e) {
      setError(isUserRejection(e) ? V2_LINK_COPY.approvalRejected : V2_LINK_COPY.approvalReverted);
      setState("verified");
    }
  }, [verified, wallet, challenge, onLinked]);

  const reset = useCallback(() => {
    // Best-effort cancel so the pair is free immediately (don't wait out expiry).
    if (challenge && (state === "awaitingTransfer" || state === "checking" || state === "verified")) {
      void fetch(`/api/v2/link/challenge/${challenge.id}`, { method: "DELETE" }).catch(() => {});
    }
    setChallenge(null);
    setVerified(null);
    setError(null);
    setState("idle");
  }, [challenge, state]);

  // The generated amount is aligned to AMOUNT_DECIMALS, so this display is exact
  // (no rounding) and the string the user reads matches the wei to be sent.
  const amountLabel = useMemo(
    () => (challenge ? formatAmount(BigInt(challenge.amountWei), 18, AMOUNT_DECIMALS) : ""),
    [challenge],
  );
  const transferLeft = challenge ? formatCountdown(challenge.expiresAt - nowSec) : "";
  const approvalLeft =
    verified?.approvalDeadline !== undefined ? formatCountdown(verified.approvalDeadline - nowSec) : "";

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

          {state === "idle" || state === "error" || state === "expired" || state === "approvalExpired" ? (
            <button type="button" onClick={startLink} className="btn btn-primary" disabled={!wallet.address}>
              {V2_LINK_COPY.linkWallet}
            </button>
          ) : null}

          {state === "creatingChallenge" ? (
            <p className="text-sm text-ink-3">Preparing your linking amount…</p>
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
              <p className="mt-2 tnum text-[0.78rem] text-ink-3">{V2_LINK_COPY.timeLeft(transferLeft)}</p>
              <button type="button" onClick={checkNow} className="mt-3 btn btn-quiet">
                {V2_LINK_COPY.checkNow}
              </button>
            </div>
          ) : null}

          {state === "verified" ? (
            <div className="rounded-[12px] border border-accent/40 bg-surface-2/40 px-4 py-3">
              <p className="text-sm text-ink">{V2_LINK_COPY.transferConfirmed}</p>
              <p className="mt-1 tnum text-[0.78rem] text-ink-3">{V2_LINK_COPY.timeLeft(approvalLeft)}</p>
              <button type="button" onClick={approve} className="mt-3 btn btn-primary">
                {V2_LINK_COPY.approveWithPrimary}
              </button>
            </div>
          ) : null}

          {state === "approving" ? <p className="text-sm text-ink-3">Confirm the approval in your wallet…</p> : null}
          {state === "expired" ? <p className="text-sm text-warn">{V2_LINK_COPY.expired}</p> : null}
          {state === "approvalExpired" ? <p className="text-sm text-warn">{V2_LINK_COPY.approvalExpired}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </>
      )}
    </section>
  );
}
