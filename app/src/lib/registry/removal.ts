/**
 * Member removal authorisation and simulation.
 *
 * Mirrors ONERegistry.removeMember exactly:
 *   - a secondary may remove itself
 *   - the primary may remove any secondary
 *   - the primary can NEVER be removed (CannotRemovePrimary)
 *   - one secondary may not remove another (NotAuthorizedToRemove)
 *   - removing the last secondary makes the ONE permanently inactive
 *
 * There is deliberately no "add member" counterpart: createOne is the only
 * function that writes a member list, so membership can only ever shrink.
 */

import { encodeFunctionData, type Address, type PublicClient } from "viem";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";
import { ONE_REGISTRY_ABI } from "./abi";
import { buildGasPlan, type GasPlan } from "./gas";
import { sameAddress } from "./members";
import type { OneProfile } from "./profile";

export type RemovalPermission =
  | { allowed: true; reason: "self" | "primary-removes-secondary" }
  | { allowed: false; reason: "not-connected" | "primary-cannot-be-removed" | "not-authorized" | "inactive" | "not-a-member" };

export function canRemove(
  profile: OneProfile,
  target: PortfolioAddress,
  connected: string | null,
): RemovalPermission {
  if (!connected) return { allowed: false, reason: "not-connected" };
  if (!profile.isActive) return { allowed: false, reason: "inactive" };
  if (!profile.members.some((m) => sameAddress(m, target))) {
    return { allowed: false, reason: "not-a-member" };
  }
  if (sameAddress(target, profile.primary)) {
    return { allowed: false, reason: "primary-cannot-be-removed" };
  }
  if (sameAddress(connected, target)) return { allowed: true, reason: "self" };
  if (sameAddress(connected, profile.primary)) {
    return { allowed: true, reason: "primary-removes-secondary" };
  }
  return { allowed: false, reason: "not-authorized" };
}

/** True when removing `target` leaves only the primary, deactivating the ONE. */
export function removalCausesDeactivation(
  profile: OneProfile,
  target: PortfolioAddress,
): boolean {
  if (sameAddress(target, profile.primary)) return false;
  return profile.memberCount - 1 < 2;
}

export function encodeRemoveMemberCalldata(
  one: PortfolioAddress,
  wallet: PortfolioAddress,
): `0x${string}` {
  return encodeFunctionData({
    abi: ONE_REGISTRY_ABI,
    functionName: "removeMember",
    args: [one, wallet],
  });
}

export type RemovalSimulation =
  | { ok: true; gasPlan: GasPlan; causesDeactivation: boolean }
  | { ok: false; error: unknown };

export async function simulateRemoval(
  client: PublicClient,
  params: {
    profile: OneProfile;
    target: PortfolioAddress;
    account: PortfolioAddress;
    bufferPercent?: number;
  },
): Promise<RemovalSimulation> {
  try {
    await client.simulateContract({
      address: ONE_REGISTRY_ADDRESS,
      abi: ONE_REGISTRY_ABI,
      functionName: "removeMember",
      args: [params.profile.address, params.target],
      account: params.account,
    });

    const [estimatedGas, gasPrice] = await Promise.all([
      client.estimateGas({
        account: params.account,
        to: ONE_REGISTRY_ADDRESS as Address,
        data: encodeRemoveMemberCalldata(params.profile.address, params.target),
      }),
      client.getGasPrice(),
    ]);

    return {
      ok: true,
      gasPlan: buildGasPlan(estimatedGas, gasPrice, params.bufferPercent),
      causesDeactivation: removalCausesDeactivation(params.profile, params.target),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Confirms the wallet was actually unbound after a removal transaction. */
export async function confirmRemoval(
  client: PublicClient,
  removed: PortfolioAddress,
): Promise<{ unbound: boolean; boundTo: string }> {
  const boundTo = (await client.readContract({
    address: ONE_REGISTRY_ADDRESS,
    abi: ONE_REGISTRY_ABI,
    functionName: "activeOneOf",
    args: [removed],
  })) as Address;

  return {
    unbound: boundTo === "0x0000000000000000000000000000000000000000",
    boundTo,
  };
}
