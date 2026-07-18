/**
 * createOne() preflight, simulation and post-submission verification.
 *
 * Nothing here submits on its own. The flow is deliberately split so the UI can
 * show a full, current picture before the user commits, and so every claim made
 * on screen is re-checked against the chain immediately before signing.
 */

import {
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";
import { ONE_REGISTRY_ABI } from "./abi";
import { buildGasPlan, type GasPlan } from "./gas";
import { computeMembersHash, secondariesInOrder, sortMembers, validateMemberSet } from "./members";
import { signatureStatusFor, type OneDraft } from "./draft";

/**
 * The auths array, ordered to match how the contract walks the member list.
 *
 * ONERegistry._verifyAllJoins iterates `sortedMembers` in order, skips the
 * primary, and consumes `auths[authIndex++]` for each secondary. So the array
 * must be the sorted member order with the primary removed — NOT signing order
 * and NOT user-entry order. Getting this wrong verifies each signature against
 * the wrong wallet and reverts with InvalidSignature.
 */
export type JoinAuth = { deadline: bigint; signature: `0x${string}` };

export function buildAuthsArray(
  sortedMembers: readonly PortfolioAddress[],
  primary: PortfolioAddress,
  signatureFor: (wallet: PortfolioAddress) => { signature: `0x${string}`; deadline: bigint } | null,
): { auths: JoinAuth[]; missing: PortfolioAddress[] } {
  const auths: JoinAuth[] = [];
  const missing: PortfolioAddress[] = [];

  for (const member of secondariesInOrder(sortedMembers, primary)) {
    const found = signatureFor(member);
    if (!found) {
      missing.push(member);
      continue;
    }
    auths.push({ deadline: found.deadline, signature: found.signature });
  }

  return { auths, missing };
}

export function encodeCreateOneCalldata(
  sortedMembers: readonly PortfolioAddress[],
  salt: `0x${string}`,
  auths: readonly JoinAuth[],
): `0x${string}` {
  return encodeFunctionData({
    abi: ONE_REGISTRY_ABI,
    functionName: "createOne",
    args: [sortedMembers as Address[], salt, auths as { deadline: bigint; signature: `0x${string}` }[]],
  });
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

export type PreflightIssue =
  | { kind: "no-primary" }
  | { kind: "no-salt" }
  | { kind: "no-deadline" }
  | { kind: "member-problem"; detail: string }
  | { kind: "wrong-chain"; connected: number | null }
  | { kind: "primary-not-connected"; expected: PortfolioAddress; connected: string | null }
  | { kind: "missing-signature"; wallet: PortfolioAddress }
  | { kind: "stale-signature"; wallet: PortfolioAddress }
  | { kind: "expired-signature"; wallet: PortfolioAddress; deadline: string }
  | { kind: "nonce-changed"; wallet: PortfolioAddress; signed: string; current: string }
  | { kind: "already-bound"; wallet: PortfolioAddress; one: string }
  | { kind: "salt-used" }
  | { kind: "predicted-occupied"; predicted: string };

export type PreflightResult = {
  ok: boolean;
  issues: PreflightIssue[];
  sortedMembers: PortfolioAddress[];
  membersHash: `0x${string}` | null;
  predictedAddress: PortfolioAddress | null;
  /** Current on-chain nonce per secondary, keyed lowercase. */
  currentNonces: Record<string, string>;
};

/**
 * Re-reads everything from the chain and re-derives every value.
 *
 * Deliberately does not trust the draft: membersHash and the predicted address
 * are recomputed, nonces are re-read, and every member is re-checked for an
 * existing binding. This runs immediately before submission precisely because
 * chain state can move between configuring and signing.
 */
export async function preflightCreateOne(
  client: PublicClient,
  draft: OneDraft,
  connected: { address: string | null; chainId: number | null },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];
  const sorted = sortMembers(draft.members);
  const currentNonces: Record<string, string> = {};

  if (!draft.primary) issues.push({ kind: "no-primary" });
  if (!draft.salt) issues.push({ kind: "no-salt" });
  if (!draft.deadline) issues.push({ kind: "no-deadline" });

  for (const problem of validateMemberSet(sorted, draft.primary)) {
    issues.push({ kind: "member-problem", detail: describeMemberProblem(problem) });
  }

  if (connected.chainId !== 143) {
    issues.push({ kind: "wrong-chain", connected: connected.chainId });
  }
  if (draft.primary && connected.address?.toLowerCase() !== draft.primary.toLowerCase()) {
    issues.push({
      kind: "primary-not-connected",
      expected: draft.primary,
      connected: connected.address,
    });
  }

  if (!draft.primary || !draft.salt || sorted.length === 0) {
    return { ok: false, issues, sortedMembers: sorted, membersHash: null, predictedAddress: null, currentNonces };
  }

  const membersHash = computeMembersHash(sorted);
  const secondaries = secondariesInOrder(sorted, draft.primary);

  // Signature presence, freshness and configuration match.
  for (const wallet of secondaries) {
    const status = signatureStatusFor(draft, wallet, nowSeconds);
    if (status.state === "missing") issues.push({ kind: "missing-signature", wallet });
    else if (status.state === "stale-config") issues.push({ kind: "stale-signature", wallet });
    else if (status.state === "expired") {
      issues.push({ kind: "expired-signature", wallet, deadline: status.signature.deadline });
    }
  }

  // Chain reads: nonces, bindings, salt usage, prediction.
  const [nonces, bindings, saltUsed, predicted] = await Promise.all([
    Promise.all(
      secondaries.map((w) =>
        client.readContract({
          address: ONE_REGISTRY_ADDRESS,
          abi: ONE_REGISTRY_ABI,
          functionName: "nonces",
          args: [w],
        }),
      ),
    ),
    Promise.all(
      sorted.map((w) =>
        client.readContract({
          address: ONE_REGISTRY_ADDRESS,
          abi: ONE_REGISTRY_ABI,
          functionName: "activeOneOf",
          args: [w],
        }),
      ),
    ),
    client.readContract({
      address: ONE_REGISTRY_ADDRESS,
      abi: ONE_REGISTRY_ABI,
      functionName: "creationSaltUsed",
      args: [creationSaltFor(draft.primary, membersHash, draft.salt)],
    }),
    client.readContract({
      address: ONE_REGISTRY_ADDRESS,
      abi: ONE_REGISTRY_ABI,
      functionName: "predictOneAddress",
      args: [draft.primary, sorted as Address[], draft.salt],
    }),
  ]);

  secondaries.forEach((wallet, i) => {
    const current = (nonces[i] as bigint).toString();
    currentNonces[wallet.toLowerCase()] = current;
    const status = signatureStatusFor(draft, wallet, nowSeconds);
    if (status.state === "valid" && status.signature.nonce !== current) {
      issues.push({ kind: "nonce-changed", wallet, signed: status.signature.nonce, current });
    }
  });

  sorted.forEach((wallet, i) => {
    const boundTo = bindings[i] as Address;
    if (boundTo !== "0x0000000000000000000000000000000000000000") {
      issues.push({ kind: "already-bound", wallet, one: boundTo });
    }
  });

  if (saltUsed as boolean) issues.push({ kind: "salt-used" });

  const predictedAddress = getAddress(predicted as Address) as PortfolioAddress;
  const codeAtPredicted = await client.getCode({ address: predictedAddress });
  if (codeAtPredicted && codeAtPredicted !== "0x") {
    issues.push({ kind: "predicted-occupied", predicted: predictedAddress });
  }

  return {
    ok: issues.length === 0,
    issues,
    sortedMembers: sorted,
    membersHash,
    predictedAddress,
    currentNonces,
  };
}

/**
 * keccak256(abi.encode(primary, membersHash, salt)) — the registry's salt guard
 * key, and the CREATE2 salt. Mirrors ONERegistry._consumeCreationSalt.
 */
export function creationSaltFor(
  primary: PortfolioAddress,
  membersHash: `0x${string}`,
  salt: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
      [primary, membersHash, salt],
    ),
  );
}

function describeMemberProblem(problem: ReturnType<typeof validateMemberSet>[number]): string {
  switch (problem.kind) {
    case "too-few":
      return `A ONE needs at least 2 wallets (currently ${problem.count}).`;
    case "too-many":
      return `A ONE can have at most 5 wallets (currently ${problem.count}).`;
    case "zero-address":
      return `The zero address cannot be a member (position ${problem.index}).`;
    case "duplicate":
      return `${problem.address} appears more than once.`;
    case "unsorted":
      return "The member list is not in ascending order.";
    case "primary-not-member":
      return `${problem.primary} is set as primary but is not in the member list.`;
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export type SimulationSuccess = {
  ok: true;
  predictedFromSimulation: PortfolioAddress;
  gasPlan: GasPlan;
  calldata: `0x${string}`;
};

export type SimulationFailure = { ok: false; error: unknown };

export async function simulateCreateOne(
  client: PublicClient,
  params: {
    account: PortfolioAddress;
    sortedMembers: readonly PortfolioAddress[];
    salt: `0x${string}`;
    auths: readonly JoinAuth[];
    bufferPercent?: number;
  },
): Promise<SimulationSuccess | SimulationFailure> {
  try {
    const { result } = await client.simulateContract({
      address: ONE_REGISTRY_ADDRESS,
      abi: ONE_REGISTRY_ABI,
      functionName: "createOne",
      args: [
        params.sortedMembers as Address[],
        params.salt,
        params.auths as { deadline: bigint; signature: `0x${string}` }[],
      ],
      account: params.account,
    });

    const calldata = encodeCreateOneCalldata(params.sortedMembers, params.salt, params.auths);

    // Estimate the EXACT call, never a class-wide worst case.
    const [estimatedGas, gasPrice] = await Promise.all([
      client.estimateGas({
        account: params.account,
        to: ONE_REGISTRY_ADDRESS,
        data: calldata,
      }),
      client.getGasPrice(),
    ]);

    return {
      ok: true,
      predictedFromSimulation: getAddress(result as Address) as PortfolioAddress,
      gasPlan: buildGasPlan(estimatedGas, gasPrice, params.bufferPercent),
      calldata,
    };
  } catch (error) {
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Post-submission verification
// ---------------------------------------------------------------------------

export type CreationOutcome =
  | {
      ok: true;
      oneAddress: PortfolioAddress;
      members: PortfolioAddress[];
      primary: PortfolioAddress;
      blockNumber: bigint;
      gasUsed: bigint;
      effectiveGasPrice: bigint;
    }
  | { ok: false; reason: "no-event" }
  | { ok: false; reason: "prediction-mismatch"; predicted: string; actual: string }
  | { ok: false; reason: "not-registered"; oneAddress: string }
  | { ok: false; reason: "member-not-bound"; wallet: string; boundTo: string };

/**
 * Extracts the created ONE from the receipt and cross-checks it against the
 * chain and the prediction.
 *
 * A mismatch between the predicted and emitted address is treated as a hard
 * failure, never a warning: it would mean the CREATE2 inputs differed from what
 * the user was shown, so the identity they now own is not the one they approved.
 */
export async function verifyCreation(
  client: PublicClient,
  receipt: TransactionReceipt,
  predictedAddress: PortfolioAddress,
): Promise<CreationOutcome> {
  let event: { one: Address; primary: Address; members: readonly Address[] } | null = null;

  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(ONE_REGISTRY_ADDRESS)) continue;
    try {
      const decoded = decodeEventLog({
        abi: ONE_REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "OneCreated") {
        const args = decoded.args as unknown as {
          one: Address;
          primary: Address;
          members: readonly Address[];
        };
        event = args;
        break;
      }
    } catch {
      // Not an event from this ABI; skip.
    }
  }

  if (!event) return { ok: false, reason: "no-event" };

  const oneAddress = getAddress(event.one) as PortfolioAddress;
  if (oneAddress.toLowerCase() !== predictedAddress.toLowerCase()) {
    return {
      ok: false,
      reason: "prediction-mismatch",
      predicted: predictedAddress,
      actual: oneAddress,
    };
  }

  const exists = await client.readContract({
    address: ONE_REGISTRY_ADDRESS,
    abi: ONE_REGISTRY_ABI,
    functionName: "exists",
    args: [oneAddress],
  });
  if (!exists) return { ok: false, reason: "not-registered", oneAddress };

  const members = event.members.map((m) => getAddress(m) as PortfolioAddress);
  const bindings = await Promise.all(
    members.map((m) =>
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "activeOneOf",
        args: [m],
      }),
    ),
  );

  for (let i = 0; i < members.length; i++) {
    const boundTo = getAddress(bindings[i] as Address);
    if (boundTo.toLowerCase() !== oneAddress.toLowerCase()) {
      return { ok: false, reason: "member-not-bound", wallet: members[i]!, boundTo };
    }
  }

  return {
    ok: true,
    oneAddress,
    members,
    primary: getAddress(event.primary) as PortfolioAddress,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
  };
}
