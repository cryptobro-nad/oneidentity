"use server";

/**
 * Server-side reads for Verified ONE V2 (transfer-linked identities).
 *
 * All membership comes from the on-chain ONERegistryV2 — nothing is read from or
 * written to browser storage, so opening a V2 identity address on any device
 * returns the same live result. Balances are loaded by the existing watch-only
 * portfolio path (address-based, registry-agnostic), so they are always current.
 */

import { getAddress, isAddress } from "viem";
import { withRpcFallback } from "@/lib/rpc";
import { ONE_REGISTRY_V2_ADDRESS, ONE_REGISTRY_V2_READ_ABI } from "@/lib/v2link/registry";
import type { PortfolioAddress } from "@/lib/types";

const ZERO = "0x0000000000000000000000000000000000000000";

export type V2Profile = {
  address: PortfolioAddress; // the ONE identity address
  primary: PortfolioAddress;
  members: PortfolioAddress[]; // primary first, then linked secondaries
  memberCount: number;
  isActive: boolean;
  registry: PortfolioAddress;
};

export type V2ProfileResult =
  | { ok: true; profile: V2Profile }
  | { ok: false; reason: "not-configured" | "not-a-one" | "invalid" | "error"; message: string };

/**
 * Resolves a V2 identity from either the identity address itself or any member
 * wallet address, then reads its membership. Public read; no wallet needed.
 */
export async function loadV2ProfileAction(input: string): Promise<V2ProfileResult> {
  if (!ONE_REGISTRY_V2_ADDRESS) {
    return { ok: false, reason: "not-configured", message: "V2 is not enabled on this deployment." };
  }
  if (!isAddress(input)) {
    return { ok: false, reason: "invalid", message: "Enter a valid address." };
  }
  const registry = ONE_REGISTRY_V2_ADDRESS;
  const query = getAddress(input);

  try {
    const outcome = await withRpcFallback(async (client) => {
      const read = <T>(name: string, arg: string) =>
        client.readContract({
          address: registry,
          abi: ONE_REGISTRY_V2_READ_ABI,
          functionName: name as never,
          args: [getAddress(arg)],
        }) as Promise<T>;

      // Treat the input as an identity address first; if it isn't one, fall back
      // to treating it as a member wallet and resolve its identity.
      let one: string | null = null;
      if (await read<boolean>("exists", query)) {
        one = query;
      } else {
        const wOne = await read<string>("activeOneOf", query);
        if (wOne !== ZERO) one = getAddress(wOne);
      }
      if (!one) return { kind: "not-a-one" as const };

      const [primary, members, count, active] = await Promise.all([
        read<string>("primaryOf", one),
        read<readonly string[]>("membersOf", one),
        read<bigint>("memberCountOf", one),
        read<boolean>("isActive", one),
      ]);

      const primaryAddr = getAddress(primary) as PortfolioAddress;
      const memberAddrs = members.map((m) => getAddress(m) as PortfolioAddress);
      // Primary first, secondaries after, for stable display.
      const ordered = [
        ...memberAddrs.filter((m) => m === primaryAddr),
        ...memberAddrs.filter((m) => m !== primaryAddr),
      ];

      return {
        kind: "ok" as const,
        profile: {
          address: getAddress(one) as PortfolioAddress,
          primary: primaryAddr,
          members: ordered,
          memberCount: Number(count),
          isActive: active,
          registry: registry as PortfolioAddress,
        },
      };
    });

    if (outcome.value.kind === "not-a-one") {
      return { ok: false, reason: "not-a-one", message: "That address is not a Verified ONE (V2) identity." };
    }
    return { ok: true, profile: outcome.value.profile };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message.split("\n")[0]! : String(error),
    };
  }
}

export type V2MembershipResult =
  | { state: "linked"; oneAddress: PortfolioAddress; role: "primary" | "secondary"; isActive: boolean; memberCount: number }
  | { state: "unlinked" }
  | { state: "not-configured" }
  | { state: "error"; message: string };

/** Reads the V2 identity a connected wallet belongs to, and its role in it. */
export async function loadV2MembershipAction(wallet: string): Promise<V2MembershipResult> {
  if (!ONE_REGISTRY_V2_ADDRESS) return { state: "not-configured" };
  if (!isAddress(wallet)) return { state: "error", message: "Invalid address." };
  const profile = await loadV2ProfileAction(wallet);
  if (!profile.ok) {
    if (profile.reason === "not-a-one") return { state: "unlinked" };
    return { state: "error", message: profile.message };
  }
  const w = getAddress(wallet);
  return {
    state: "linked",
    oneAddress: profile.profile.address,
    role: w === profile.profile.primary ? "primary" : "secondary",
    isActive: profile.profile.isActive,
    memberCount: profile.profile.memberCount,
  };
}
