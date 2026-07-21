"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createPublicClient, http } from "viem";
import { ActiveOneCard } from "@/components/verified/ActiveOneCard";
import { ErrorNotice } from "@/components/Notices";
import { SetupStep } from "@/components/verified/SetupStep";
import { SigningStep } from "@/components/verified/SigningStep";
import { ReviewStep } from "@/components/verified/ReviewStep";
import { WalletConnect } from "@/components/verified/WalletConnect";
import { monad, ONE_REGISTRY_ADDRESS, PRIMARY_RPC } from "@/lib/chain";
import { ONE_REGISTRY_ABI } from "@/lib/registry/abi";
import {
  buildAuthsArray,
  preflightCreateOne,
  simulateCreateOne,
  verifyCreation,
  type PreflightIssue,
} from "@/lib/registry/create";
import {
  configFingerprint,
  pruneInvalidSignatures,
  signatureStatusFor,
  upsertSignature,
  type OneDraft,
} from "@/lib/registry/draft";
import {
  getServerSnapshot,
  getSnapshot,
  resetDraft,
  subscribe,
  updateDraft,
} from "@/lib/registry/draftStore";
import { buildJoinOneTypedData, deadlineFromNow, generateSalt } from "@/lib/registry/eip712";
import { decodeRegistryError, type DecodedError } from "@/lib/registry/errors";
import { DEFAULT_GAS_BUFFER_PERCENT, type GasPlan } from "@/lib/registry/gas";
import { computeMembersHash, sameAddress, sortMembers } from "@/lib/registry/members";
import { useWallet } from "@/lib/wallet/useWallet";
import type { PortfolioAddress } from "@/lib/types";
import {
  loadWalletMembershipAction,
  readMemberStates,
  type MemberChainState,
  type MembershipActionResult,
} from "./actions";

/** Read-only client for simulation/preflight; the wallet handles writes. */
const publicClient = createPublicClient({ chain: monad, transport: http(PRIMARY_RPC) });

export function VerifiedClient() {
  const router = useRouter();
  const wallet = useWallet();

  // The draft lives in localStorage, which is external to React and absent on
  // the server — useSyncExternalStore avoids both a hydration mismatch and the
  // cascading render an initialise-in-effect would cause.
  const draft = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [chainState, setChainState] = useState<MemberChainState[]>([]);
  const [checking, setChecking] = useState(false);
  const [invalidatedNotice, setInvalidatedNotice] = useState(false);

  const [signing, setSigning] = useState<PortfolioAddress | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  const [bufferPercent, setBufferPercent] = useState(DEFAULT_GAS_BUFFER_PERCENT);
  const [gasPlan, setGasPlan] = useState<GasPlan | null>(null);
  const [predicted, setPredicted] = useState<PortfolioAddress | null>(null);
  const [issues, setIssues] = useState<PreflightIssue[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<DecodedError | null>(null);
  const [simulatedFingerprint, setSimulatedFingerprint] = useState<string | null>(null);
  const [membership, setMembership] = useState<{ forWallet: string; result: MembershipActionResult } | null>(null);

  // Whether the connected wallet already belongs to a ONE. Re-read whenever the
  // connected account changes, so switching accounts updates the card. State is
  // only written after the await, so this never cascades a synchronous render.
  useEffect(() => {
    const connected = wallet.address;
    if (!connected) return;

    let cancelled = false;
    const run = async () => {
      const result = await loadWalletMembershipAction(connected);
      if (!cancelled) setMembership({ forWallet: connected, result });
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [wallet.address]);

  /**
   * Membership, but only when it describes the CURRENTLY connected wallet.
   *
   * Derived rather than cleared in an effect: disconnecting or switching
   * accounts must not leave the previous wallet's ONE on screen, and comparing
   * addresses is exact where an effect would lag by a render.
   */
  const membershipForConnected =
    wallet.address && membership?.forWallet.toLowerCase() === wallet.address.toLowerCase()
      ? membership.result
      : null;

  const sortedMembers = useMemo(() => sortMembers(draft.members), [draft.members]);
  const fingerprint = useMemo(() => configFingerprint(draft), [draft]);

  /**
   * Whether the current simulation still describes the current configuration.
   *
   * Derived during render rather than cleared in an effect: the simulation is a
   * function of the config, so comparing fingerprints is exact and cannot lag
   * behind a change the way an effect would.
   */
  const simulationValid = simulatedFingerprint !== null && simulatedFingerprint === fingerprint;
  const effectiveGasPlan = simulationValid ? gasPlan : null;
  const effectivePredicted = simulationValid ? predicted : null;

  /** Applies a change and prunes any signature it invalidated. */
  const mutate = useCallback((next: (current: OneDraft) => OneDraft) => {
    const updated = updateDraft((current) => {
      const candidate = next(current);
      // Seed salt/deadline so a draft is never missing values signatures commit to.
      const seeded: OneDraft = {
        ...candidate,
        salt: candidate.salt ?? generateSalt(),
        deadline: candidate.deadline ?? deadlineFromNow().toString(),
      };
      return pruneInvalidSignatures(seeded).draft;
    });
    // Compare counts to detect pruning without threading state through the store.
    if (updated.signatures.length < draft.signatures.length) setInvalidatedNotice(true);
    setError(null);
  }, [draft.signatures.length]);

  const refreshChainState = useCallback(async (addresses: PortfolioAddress[]) => {
    if (addresses.length === 0) {
      setChainState([]);
      return;
    }
    setChecking(true);
    try {
      const result = await readMemberStates(addresses);
      if (result.ok) setChainState(result.members);
    } finally {
      setChecking(false);
    }
  }, []);

  // Re-read binding/nonce whenever the member list changes. State is only set
  // after the await, so this never cascades a synchronous render.
  useEffect(() => {
    const addresses = draft.members;
    if (addresses.length === 0) return;

    let cancelled = false;
    const run = async () => {
      const result = await readMemberStates(addresses);
      if (!cancelled && result.ok) setChainState(result.members);
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [draft.members]);

  // -------------------------------------------------------------------------
  // Signing
  // -------------------------------------------------------------------------

  const signFor = useCallback(
    async (target: PortfolioAddress) => {
      setSignError(null);

      if (!draft.primary || !draft.salt || !draft.deadline) {
        setSignError("Select a primary wallet before signing.");
        return;
      }

      // Re-read the connected account: `accountsChanged` can lag, and signing
      // with a stale address would attribute the signature to the wrong wallet.
      const live = await wallet.refreshAccount();
      if (!sameAddress(live, target)) {
        setSignError(
          `The connected wallet is ${live ?? "none"}, not ${target}. Switch accounts and try again.`,
        );
        return;
      }
      // Check the network live and request the switch as part of signing, rather
      // than trusting possibly-stale chain state or a separate button press.
      if (!(await wallet.ensureOnMonad())) {
        setSignError("Open your wallet, select Monad Mainnet, return here, then tap Check again.");
        return;
      }

      const client = wallet.getWalletClient();
      if (!client) {
        setSignError("No wallet client available.");
        return;
      }

      setSigning(target);
      try {
        // Re-read the nonce immediately before signing so the signed value is
        // the one the contract will check.
        const nonce = (await publicClient.readContract({
          address: ONE_REGISTRY_ADDRESS,
          abi: ONE_REGISTRY_ABI,
          functionName: "nonces",
          args: [target],
        })) as bigint;

        const typedData = buildJoinOneTypedData({
          wallet: target,
          primaryWallet: draft.primary,
          membersHash: computeMembersHash(sortedMembers),
          salt: draft.salt,
          nonce,
          deadline: BigInt(draft.deadline),
        });

        const signature = await client.signTypedData({
          account: target,
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });

        updateDraft((current) =>
          upsertSignature(current, {
            wallet: target,
            signature,
            nonce: nonce.toString(),
            deadline: current.deadline!,
            configFingerprint: configFingerprint(current),
            signedAt: Date.now(),
          }),
        );
      } catch (err) {
        setSignError(decodeRegistryError(err).detail);
      } finally {
        setSigning(null);
      }
    },
    [draft.primary, draft.salt, draft.deadline, sortedMembers, wallet],
  );

  // -------------------------------------------------------------------------
  // Simulate
  // -------------------------------------------------------------------------

  const runSimulation = useCallback(async () => {
    setSimulating(true);
    setError(null);
    try {
      const pre = await preflightCreateOne(publicClient, draft, {
        address: wallet.address,
        chainId: wallet.chainId,
      });
      setIssues(pre.issues);
      setPredicted(pre.predictedAddress);

      if (!pre.ok || !draft.primary || !draft.salt) {
        setGasPlan(null);
        return;
      }

      const { auths, missing } = buildAuthsArray(pre.sortedMembers, draft.primary, (w) => {
        const status = signatureStatusFor(draft, w);
        if (status.state !== "valid") return null;
        return {
          signature: status.signature.signature,
          deadline: BigInt(status.signature.deadline),
        };
      });
      if (missing.length > 0) {
        setGasPlan(null);
        return;
      }

      const sim = await simulateCreateOne(publicClient, {
        account: draft.primary,
        sortedMembers: pre.sortedMembers,
        salt: draft.salt,
        auths,
        bufferPercent,
      });

      if (!sim.ok) {
        setGasPlan(null);
        setError(decodeRegistryError(sim.error));
        return;
      }

      // The simulation returns the address the registry itself computed.
      if (
        pre.predictedAddress &&
        !sameAddress(sim.predictedFromSimulation, pre.predictedAddress)
      ) {
        setError({
          name: "PredictionMismatch",
          title: "Predicted address does not match the simulation",
          detail:
            `predictOneAddress returned ${pre.predictedAddress} but simulating createOne produced ` +
            `${sim.predictedFromSimulation}. Do not submit.`,
          technical: "prediction/simulation mismatch",
        });
        setGasPlan(null);
        return;
      }

      setGasPlan(sim.gasPlan);
      setSimulatedFingerprint(configFingerprint(draft));
    } catch (err) {
      setError(decodeRegistryError(err));
    } finally {
      setSimulating(false);
    }
  }, [draft, wallet.address, wallet.chainId, bufferPercent]);

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const submit = useCallback(async () => {
    // Guard on the DERIVED values: a config change since simulating nulls them.
    if (!draft.primary || !draft.salt || !effectiveGasPlan || !effectivePredicted) return;

    setSubmitting(true);
    setError(null);
    try {
      // Check the network live and request the switch as part of Create, so a
      // wallet that drifted off Monad after simulating can't submit blind.
      if (!(await wallet.ensureOnMonad())) {
        setError({
          name: "WrongNetwork",
          title: "Wrong network",
          detail: "Open your wallet, select Monad Mainnet, return here, then tap Check again.",
          technical: "wallet not on Monad Mainnet at submit",
        });
        setSubmitting(false);
        return;
      }

      // Re-run preflight against current chain state; nonces and bindings can
      // move between simulating and submitting.
      const pre = await preflightCreateOne(publicClient, draft, {
        address: wallet.address,
        chainId: wallet.chainId,
      });
      setIssues(pre.issues);
      if (!pre.ok) {
        setSubmitting(false);
        return;
      }

      const { auths, missing } = buildAuthsArray(pre.sortedMembers, draft.primary, (w) => {
        const status = signatureStatusFor(draft, w);
        if (status.state !== "valid") return null;
        return {
          signature: status.signature.signature,
          deadline: BigInt(status.signature.deadline),
        };
      });
      if (missing.length > 0) {
        setSubmitting(false);
        return;
      }

      const client = wallet.getWalletClient();
      if (!client) throw new Error("No wallet client available.");

      const hash = await client.writeContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "createOne",
        args: [pre.sortedMembers, draft.salt, auths],
        account: draft.primary,
        chain: monad,
        gas: effectiveGasPlan.gasLimit,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const outcome = await verifyCreation(publicClient, receipt, effectivePredicted);

      if (!outcome.ok) {
        setError({
          name: "CreationVerificationFailed",
          title:
            outcome.reason === "prediction-mismatch"
              ? "Created address does not match the prediction"
              : "Could not verify the created identity",
          detail:
            outcome.reason === "prediction-mismatch"
              ? `The transaction created ${outcome.actual}, but ${outcome.predicted} was predicted and shown to you. Do not treat this identity as the one you approved.`
              : `Verification failed: ${outcome.reason}. The transaction is on-chain — check the explorer before retrying.`,
          technical: `${outcome.reason} · tx ${hash}`,
        });
        return;
      }

      // Success: signatures must not outlive the creation they authorised.
      resetDraft();
      router.push(`/one/${outcome.oneAddress}`);
    } catch (err) {
      setError(decodeRegistryError(err));
    } finally {
      setSubmitting(false);
    }
  }, [draft, effectiveGasPlan, effectivePredicted, wallet, router]);

  const signaturesStarted = draft.signatures.length > 0;
  // Submission requires a simulation of THIS exact configuration.
  const canSubmit =
    issues.length === 0 && effectiveGasPlan !== null && effectivePredicted !== null;

  return (
    <div className="space-y-12">
      <WalletConnect wallet={wallet} />

      {/* An already-linked wallet sees its identity FIRST, not buried in an
          error. The creation guardrail still appears further down. */}
      {membershipForConnected?.state === "linked" ? (
        <ActiveOneCard membership={membershipForConnected} connectedAddress={wallet.address!} />
      ) : null}

      {membershipForConnected?.state === "error" ? (
        <ErrorNotice title="Could not check this wallet's ONE status">
          {membershipForConnected.message}
          <p className="mt-2 text-ink">
            Creation is disabled until this can be confirmed — proceeding on an unknown state
            risks a transaction that reverts.
          </p>
        </ErrorNotice>
      ) : null}

      {invalidatedNotice ? (
        <div role="status" className="rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3.5">
          <p className="text-sm font-medium text-ink">
            The identity configuration changed. Previous signatures are no longer valid.
          </p>
          <button
            type="button"
            onClick={() => setInvalidatedNotice(false)}
            className="mt-2 text-xs text-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <SetupStep
        members={draft.members}
        primary={draft.primary}
        chainState={chainState}
        checking={checking}
        locked={signaturesStarted}
        onAdd={(a) => mutate((d) => ({ ...d, members: [...d.members, a] }))}
        onRemove={(a) =>
          mutate((d) => ({
            ...d,
            members: d.members.filter((m) => !sameAddress(m, a)),
            primary: sameAddress(d.primary, a) ? null : d.primary,
          }))
        }
        onSelectPrimary={(a) => mutate((d) => ({ ...d, primary: a }))}
        onRefresh={() => void refreshChainState(draft.members)}
      />

      {draft.members.length >= 2 && draft.primary ? (
        <div className="border-t border-line pt-12">
          <SigningStep
            draft={draft}
            connectedAddress={wallet.address}
            isOnMonad={wallet.isOnMonad}
            signing={signing}
            onSign={(w) => void signFor(w)}
            error={signError}
          />
        </div>
      ) : null}

      {draft.members.length >= 2 && draft.primary ? (
        <div className="border-t border-line pt-12">
          <ReviewStep
            primary={draft.primary}
            sortedMembers={sortedMembers}
            predictedAddress={effectivePredicted}
            deadline={draft.deadline}
            gasPlan={effectiveGasPlan}
            bufferPercent={bufferPercent}
            onBufferChange={setBufferPercent}
            issues={issues}
            simulating={simulating}
            canSubmit={canSubmit}
            submitting={submitting}
            onSimulate={() => void runSimulation()}
            onSubmit={() => void submit()}
            error={error}
          />
        </div>
      ) : null}
    </div>
  );
}
