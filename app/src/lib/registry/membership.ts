/**
 * "Which ONE does this wallet belong to, and in what role?"
 *
 * Used by the Verified ONE page to surface a connected wallet's existing
 * identity before the creation flow, rather than leaving it buried in a
 * guardrail message.
 *
 * The role is read from the Registry's own `primaryOf`, never inferred from
 * entry order or list position. Those are presentation details; the contract is
 * the only authority on who the primary is.
 */

import { getAddress, isAddress, type Address, type PublicClient } from "viem";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import { ONE_REGISTRY_ABI } from "./abi";
import type { PortfolioAddress } from "@/lib/types";
import { ZERO_ADDRESS } from "./lookup";

export type WalletRole = "primary" | "secondary";

export type MembershipResult =
  /** The wallet belongs to an active ONE. */
  | {
      state: "linked";
      oneAddress: PortfolioAddress;
      role: WalletRole;
      isActive: boolean;
      memberCount: number;
    }
  /** The wallet is free to join or create a ONE. */
  | { state: "unlinked" }
  /**
   * The Registry could not be read.
   *
   * Deliberately distinct from `unlinked`: an unreachable node must never be
   * presented as "you have no ONE", and creation must not be enabled on the
   * strength of a failed read.
   */
  | { state: "error"; message: string };

export async function loadWalletMembership(
  client: PublicClient,
  wallet: string,
): Promise<MembershipResult> {
  if (!isAddress(wallet, { strict: false })) {
    return { state: "error", message: "The connected address is not a valid EVM address." };
  }

  const normalized = getAddress(wallet) as PortfolioAddress;

  let activeOne: unknown;
  try {
    activeOne = await client.readContract({
      address: ONE_REGISTRY_ADDRESS,
      abi: ONE_REGISTRY_ABI,
      functionName: "activeOneOf",
      args: [normalized],
    });
  } catch (error) {
    return {
      state: "error",
      message:
        "Could not check whether this wallet already belongs to a ONE. " +
        (error instanceof Error ? error.message.split("\n")[0]! : String(error)),
    };
  }

  if (typeof activeOne !== "string" || !isAddress(activeOne, { strict: false })) {
    return { state: "error", message: "The Registry returned an unexpected value for this wallet." };
  }

  const oneAddress = getAddress(activeOne as Address) as PortfolioAddress;
  if (oneAddress === ZERO_ADDRESS) return { state: "unlinked" };

  // Resolve the role and status from the identity itself.
  try {
    const [primary, isActive, memberCount] = await Promise.all([
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "primaryOf",
        args: [oneAddress],
      }),
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "isActive",
        args: [oneAddress],
      }),
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "memberCountOf",
        args: [oneAddress],
      }),
    ]);

    const primaryAddress = getAddress(primary as Address);
    return {
      state: "linked",
      oneAddress,
      role: primaryAddress === normalized ? "primary" : "secondary",
      isActive: Boolean(isActive),
      memberCount: Number(memberCount as bigint),
    };
  } catch (error) {
    return {
      state: "error",
      message:
        "Found a linked ONE but could not read its details. " +
        (error instanceof Error ? error.message.split("\n")[0]! : String(error)),
    };
  }
}
