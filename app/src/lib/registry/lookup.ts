/**
 * ONE lookup resolution.
 *
 * Turns an arbitrary user-pasted address into a ONE identity address, by asking
 * the Registry two questions in a deliberate order.
 *
 * ## Why the order matters
 *
 * `exists()` is checked first because a ONE identity address and a linked
 * wallet are different things, and only `exists()` can recognise a ONE that has
 * gone **inactive**. Checking `activeOneOf()` first would resolve a wallet that
 * happens to also be a member, and would silently fail for historical
 * identities — which are exactly the ones a person is most likely to be looking
 * up from an old link.
 *
 * ## The asymmetry worth knowing
 *
 * A ONE identity address resolves whether it is active or inactive.
 * A wallet address resolves only to its **current active** ONE. The Registry
 * keeps no reverse index from wallet to historical membership, so an inactive
 * relationship cannot be found from a wallet address. That is a property of the
 * deployed contract, not something this module can work around.
 */

import { getAddress, isAddress, type Address, type PublicClient } from "viem";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import { ONE_REGISTRY_ABI } from "./abi";
import type { PortfolioAddress } from "@/lib/types";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export type LookupSuccess = {
  ok: true;
  oneAddress: PortfolioAddress;
  /** Whether the input was the identity itself or a wallet linked to it. */
  resolvedFrom: "identity" | "wallet";
};

export type LookupErrorCode =
  | "INVALID_ADDRESS"
  | "NOT_FOUND"
  | "RPC_ERROR"
  | "UNEXPECTED_ERROR";

export type LookupFailure = {
  ok: false;
  code: LookupErrorCode;
  message: string;
};

export type LookupResult = LookupSuccess | LookupFailure;

export const LOOKUP_MESSAGES: Record<LookupErrorCode, string> = {
  INVALID_ADDRESS:
    "That is not a valid address. Paste a ONE identity address, or a wallet address, starting with 0x.",
  NOT_FOUND: "No Verified ONE was found for this address.",
  RPC_ERROR:
    "Monad could not be reached just now, so this address could not be checked. Please try again.",
  UNEXPECTED_ERROR:
    "The Registry returned something unexpected. This address could not be resolved.",
};

/**
 * Resolves an input address to a ONE identity.
 *
 * An RPC failure is returned as `RPC_ERROR` and never as `NOT_FOUND` — telling
 * someone their ONE does not exist because a node was briefly unreachable would
 * be worse than telling them nothing.
 */
export async function resolveOneLookup(
  client: PublicClient,
  input: string,
): Promise<LookupResult> {
  const trimmed = input.trim();

  // Validate before any network call: an invalid address must cost nothing.
  if (trimmed.length === 0 || !isAddress(trimmed, { strict: false })) {
    return { ok: false, code: "INVALID_ADDRESS", message: LOOKUP_MESSAGES.INVALID_ADDRESS };
  }

  let normalized: PortfolioAddress;
  try {
    normalized = getAddress(trimmed) as PortfolioAddress;
  } catch {
    return { ok: false, code: "INVALID_ADDRESS", message: LOOKUP_MESSAGES.INVALID_ADDRESS };
  }

  // --- A. Is it a ONE identity? Works for active AND inactive identities. ---
  let exists: unknown;
  try {
    exists = await client.readContract({
      address: ONE_REGISTRY_ADDRESS,
      abi: ONE_REGISTRY_ABI,
      functionName: "exists",
      args: [normalized],
    });
  } catch (error) {
    return { ok: false, code: "RPC_ERROR", message: describeRpcError(error) };
  }

  if (typeof exists !== "boolean") {
    return { ok: false, code: "UNEXPECTED_ERROR", message: LOOKUP_MESSAGES.UNEXPECTED_ERROR };
  }

  if (exists) {
    return { ok: true, oneAddress: normalized, resolvedFrom: "identity" };
  }

  // --- B. Is it a wallet linked to an active ONE? ---
  let activeOne: unknown;
  try {
    activeOne = await client.readContract({
      address: ONE_REGISTRY_ADDRESS,
      abi: ONE_REGISTRY_ABI,
      functionName: "activeOneOf",
      args: [normalized],
    });
  } catch (error) {
    return { ok: false, code: "RPC_ERROR", message: describeRpcError(error) };
  }

  if (typeof activeOne !== "string" || !isAddress(activeOne, { strict: false })) {
    return { ok: false, code: "UNEXPECTED_ERROR", message: LOOKUP_MESSAGES.UNEXPECTED_ERROR };
  }

  if (getAddress(activeOne as Address) !== ZERO_ADDRESS) {
    return {
      ok: true,
      oneAddress: getAddress(activeOne as Address) as PortfolioAddress,
      resolvedFrom: "wallet",
    };
  }

  // --- C. Neither. ---
  return { ok: false, code: "NOT_FOUND", message: LOOKUP_MESSAGES.NOT_FOUND };
}

function describeRpcError(error: unknown): string {
  const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
  return `${LOOKUP_MESSAGES.RPC_ERROR}${detail ? ` (${detail})` : ""}`;
}

/** Public profile path for a ONE. Kept here so every caller agrees. */
export function oneProfilePath(oneAddress: string): string {
  return `/one/${oneAddress}`;
}
