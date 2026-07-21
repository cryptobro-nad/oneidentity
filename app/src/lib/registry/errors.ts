/**
 * Decodes ONERegistry custom errors into text a person can act on.
 *
 * A raw `0x1f2a2005` tells the user nothing. Every error the registry can throw
 * is mapped to a plain explanation plus, where possible, a concrete next step.
 * The original hex and message are always preserved for the details panel —
 * explaining an error is not the same as hiding it.
 */

import { BaseError, ContractFunctionRevertedError, decodeErrorResult } from "viem";
import { ONE_REGISTRY_ABI } from "./abi";

export type DecodedError = {
  /** Contract error name, or a synthetic kind for non-contract failures. */
  name: string;
  title: string;
  detail: string;
  /** What the user can do about it, when there is something. */
  action?: string;
  /** Raw revert data / message, for the expandable technical section. */
  technical: string;
};

type Explainer = (args: readonly unknown[]) => Omit<DecodedError, "name" | "technical">;

const asAddress = (v: unknown) => (typeof v === "string" ? v : String(v));
const asNumber = (v: unknown) => (typeof v === "bigint" ? v.toString() : String(v));

const EXPLAINERS: Record<string, Explainer> = {
  InvalidMemberCount: (args) => ({
    title: "Wrong number of wallets",
    detail: `A Verified ONE needs between 2 and 5 wallets. This attempt had ${asNumber(args[0])}.`,
    action: "Add or remove wallets so the total is between 2 and 5.",
  }),
  ZeroAddressMember: (args) => ({
    title: "Zero address in the member list",
    detail: `The wallet at position ${asNumber(args[0])} is the zero address, which cannot be a member.`,
    action: "Remove the zero address and re-enter the correct wallet.",
  }),
  DuplicateMember: (args) => ({
    title: "Duplicate wallet",
    detail: `${asAddress(args[0])} appears more than once in the member list.`,
    action: "Remove the duplicate. Each wallet can appear only once.",
  }),
  UnsortedMembers: (args) => ({
    title: "Member list is not sorted",
    detail:
      `The registry requires members in strictly ascending numeric order; ` +
      `position ${asNumber(args[0])} breaks that order.`,
    action:
      "This looks like a bug in ONE, not something you did. Please report it. " +
      "ONE sorts the list automatically before submitting.",
  }),
  PrimaryNotInMemberList: (args) => ({
    title: "Primary wallet is not a member",
    detail: `${asAddress(args[0])} submitted the transaction but is not in the member list.`,
    action: "Connect the wallet you selected as primary, then try again.",
  }),
  WalletAlreadyInActiveOne: (args) => ({
    title: "Wallet already belongs to an active ONE",
    detail:
      `${asAddress(args[0])} is already a member of the active ONE at ${asAddress(args[1])}. ` +
      "A wallet can belong to only one active ONE at a time.",
    action:
      "Remove that wallet from this draft, or leave its existing ONE first " +
      "(a secondary can remove itself; the primary can remove a secondary).",
  }),
  AuthCountMismatch: (args) => ({
    title: "Wrong number of signatures",
    detail: `The registry expected ${asNumber(args[0])} secondary signatures but received ${asNumber(args[1])}.`,
    action: "Collect a signature from every secondary wallet before submitting.",
  }),
  SignatureExpired: (args) => ({
    title: "A signature has expired",
    detail: `The authorization from ${asAddress(args[0])} expired at ${formatDeadline(args[1])}.`,
    action: "Ask that wallet to sign again with a fresh deadline.",
  }),
  InvalidSignature: (args) => ({
    title: "A signature did not verify",
    detail:
      `The registry expected a signature from ${asAddress(args[0])} but recovered ${asAddress(args[1])}. ` +
      "This usually means the wallet's nonce changed, or the configuration was edited after signing.",
    action: "Re-collect signatures for the current configuration.",
  }),
  CreationSaltAlreadyUsed: () => ({
    title: "This creation intent was already used",
    detail:
      "The combination of primary wallet, member set and salt has already been submitted. " +
      "Each creation intent can be used only once.",
    action: "Start a new draft. ONE will generate a fresh salt.",
  }),
  UnknownOne: (args) => ({
    title: "Not a ONE identity",
    detail: `${asAddress(args[0])} was not created by this registry.`,
    action: "Check the address.",
  }),
  OneNotActive: (args) => ({
    title: "This ONE is inactive",
    detail: `${asAddress(args[0])} has only its primary wallet left, so it is permanently inactive.`,
    action: "Inactive identities cannot be modified. Create a new ONE instead.",
  }),
  CannotRemovePrimary: (args) => ({
    title: "The primary cannot be removed",
    detail: `${asAddress(args[0])} is the primary wallet and can never be removed from its ONE.`,
    action: "Remove the secondary wallets instead; the ONE goes inactive when the last one leaves.",
  }),
  NotAuthorizedToRemove: (args) => ({
    title: "Not authorized to remove that wallet",
    detail: `${asAddress(args[0])} may not remove this member. A secondary can remove only itself; the primary can remove any secondary.`,
    action: "Connect the wallet being removed, or the primary wallet.",
  }),
  NotAMember: (args) => ({
    title: "Not a member of this ONE",
    detail: `${asAddress(args[1])} is not a current member of ${asAddress(args[0])}.`,
    action: "Refresh the page to see the current member list.",
  }),
};

function formatDeadline(value: unknown): string {
  try {
    const seconds = typeof value === "bigint" ? Number(value) : Number(String(value));
    return new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return String(value);
  }
}

/** Non-contract failures the UI must still explain rather than dump raw. */
function classifyGenericError(error: unknown): DecodedError | null {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request") ||
    (error as { code?: number })?.code === 4001
  ) {
    return {
      name: "UserRejected",
      title: "Request rejected in wallet",
      detail: "You dismissed the request in your wallet. Nothing was sent and nothing was signed.",
      action: "Try again when ready.",
      technical: message,
    };
  }

  if (lower.includes("insufficient funds")) {
    return {
      name: "InsufficientFunds",
      title: "Not enough MON",
      detail:
        "The primary wallet does not hold enough MON to cover this transaction. " +
        "Remember that Monad charges the full gas limit, not just the gas used.",
      action: "Add MON to the primary wallet and try again.",
      technical: message,
    };
  }

  if (lower.includes("chain") && (lower.includes("mismatch") || lower.includes("does not match"))) {
    return {
      name: "WrongChain",
      title: "Wrong network",
      detail: "Your wallet is not on Monad Mainnet (chain 143).",
      action: "Switch the wallet to Monad Mainnet and try again.",
      technical: message,
    };
  }

  return null;
}

/**
 * Best-effort decode of any error thrown by a simulate/write/read call.
 * Always returns something presentable — never a bare hex string.
 */
export function decodeRegistryError(error: unknown): DecodedError {
  const generic = classifyGenericError(error);
  if (generic) return generic;

  const technical = error instanceof Error ? error.message : String(error);

  // viem wraps revert data; walk the chain for the decoded custom error.
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const args = (reverted.data?.args ?? []) as readonly unknown[];
      if (name && EXPLAINERS[name]) {
        return { name, technical, ...EXPLAINERS[name](args) };
      }
      if (name) {
        return {
          name,
          title: "The transaction would fail",
          detail: `The registry rejected this with ${name}.`,
          technical,
        };
      }
    }
  }

  // Fall back to decoding raw revert data if it is present anywhere.
  const raw = extractRevertData(error);
  if (raw) {
    try {
      const decoded = decodeErrorResult({ abi: ONE_REGISTRY_ABI, data: raw });
      const name = decoded.errorName;
      const args = (decoded.args ?? []) as readonly unknown[];
      if (EXPLAINERS[name]) return { name, technical, ...EXPLAINERS[name](args) };
      return {
        name,
        title: "The transaction would fail",
        detail: `The registry rejected this with ${name}.`,
        technical,
      };
    } catch {
      // not a known custom error
    }
  }

  return {
    name: "UnknownError",
    title: "Something went wrong",
    detail:
      "The request could not be completed. The technical details below may help " +
      "identify the cause.",
    technical,
  };
}

function extractRevertData(error: unknown): `0x${string}` | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): `0x${string}` | null => {
    if (!node || depth > 6 || seen.has(node)) return null;
    seen.add(node);
    if (typeof node === "object") {
      const candidate = (node as { data?: unknown }).data;
      if (typeof candidate === "string" && /^0x[0-9a-fA-F]{8,}$/.test(candidate)) {
        return candidate as `0x${string}`;
      }
      for (const key of ["cause", "error", "details"] as const) {
        const found = walk((node as Record<string, unknown>)[key], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(error, 0);
}
