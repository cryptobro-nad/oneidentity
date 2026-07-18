/**
 * Public ONE profile reads.
 *
 * Mirrors the contract's own rule: an inactive identity keeps its metadata
 * forever but refuses aggregation. `ONEIdentity` reverts InactiveIdentity on
 * every combined* call once only the primary remains, so this module must not
 * call them — doing so would surface a confusing revert instead of an honest
 * "inactive" state.
 */

import { getAddress, type Address, type PublicClient } from "viem";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";
import { ONE_REGISTRY_ABI } from "./abi";

export type OneProfile = {
  address: PortfolioAddress;
  exists: boolean;
  isActive: boolean;
  primary: PortfolioAddress;
  members: PortfolioAddress[];
  memberCount: number;
  registry: PortfolioAddress;
  blockNumber: bigint;
};

export type ProfileResult =
  | { status: "ok"; profile: OneProfile }
  | { status: "not-a-one"; address: PortfolioAddress }
  | { status: "error"; address: PortfolioAddress; error: string };

/**
 * Loads a ONE profile.
 *
 * `exists()` is checked first and short-circuits: every other registry read
 * reverts UnknownOne for a non-ONE address, so calling them first would turn a
 * clean "that isn't a ONE" into an error state.
 */
export async function loadOneProfile(
  client: PublicClient,
  address: string,
): Promise<ProfileResult> {
  let oneAddress: PortfolioAddress;
  try {
    oneAddress = getAddress(address) as PortfolioAddress;
  } catch {
    return { status: "not-a-one", address: address as PortfolioAddress };
  }

  try {
    const exists = await client.readContract({
      address: ONE_REGISTRY_ADDRESS,
      abi: ONE_REGISTRY_ABI,
      functionName: "exists",
      args: [oneAddress],
    });

    if (!exists) return { status: "not-a-one", address: oneAddress };

    const [isActive, primary, members, memberCount, blockNumber] = await Promise.all([
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "isActive",
        args: [oneAddress],
      }),
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "primaryOf",
        args: [oneAddress],
      }),
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "membersOf",
        args: [oneAddress],
      }),
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "memberCountOf",
        args: [oneAddress],
      }),
      client.getBlockNumber(),
    ]);

    return {
      status: "ok",
      profile: {
        address: oneAddress,
        exists: true,
        isActive: isActive as boolean,
        primary: getAddress(primary as Address) as PortfolioAddress,
        members: (members as readonly Address[]).map((m) => getAddress(m) as PortfolioAddress),
        memberCount: Number(memberCount as bigint),
        registry: ONE_REGISTRY_ADDRESS,
        blockNumber: blockNumber as bigint,
      },
    };
  } catch (error) {
    return {
      status: "error",
      address: oneAddress,
      error: error instanceof Error ? error.message.split("\n")[0]! : String(error),
    };
  }
}

/**
 * Whether balance aggregation may be attempted for this profile.
 *
 * Gate every aggregation call on this. An inactive ONE would revert
 * InactiveIdentity, and its "combined" balance would be the lone primary's
 * holdings — which must never be presented as a multi-wallet total.
 */
export function mayAggregate(profile: OneProfile): boolean {
  return profile.isActive && profile.memberCount >= 2;
}
