"use server";

/**
 * Read-only server actions for the Verified ONE flow.
 *
 * Chain reads run server-side for the same reason as Phase 1: no CORS, one
 * place to control endpoint choice and failover. Signing and transaction
 * submission stay in the browser, because only the user's wallet can do those.
 * Nothing here can write to the chain.
 */

import { getAddress } from "viem";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import { withRpcFallback } from "@/lib/rpc";
import { ONE_REGISTRY_ABI } from "@/lib/registry/abi";
import { loadOneProfile } from "@/lib/registry/profile";
import { LOOKUP_MESSAGES, resolveOneLookup, type LookupResult } from "@/lib/registry/lookup";
import { loadWalletMembership } from "@/lib/registry/membership";
import type { PortfolioAddress } from "@/lib/types";

export type MemberChainState = {
  address: PortfolioAddress;
  activeOne: string;
  nonce: string;
};

export type SetupStateResult =
  | { ok: true; members: MemberChainState[]; blockNumber: string }
  | { ok: false; error: string };

/** Reads binding + nonce for every candidate member. */
export async function readMemberStates(addresses: string[]): Promise<SetupStateResult> {
  const clean: PortfolioAddress[] = [];
  for (const raw of addresses) {
    try {
      clean.push(getAddress(raw) as PortfolioAddress);
    } catch {
      return { ok: false, error: `Invalid address: ${raw}` };
    }
  }
  if (clean.length === 0) return { ok: false, error: "No addresses provided." };

  try {
    const outcome = await withRpcFallback(async (client) => {
      const [bindings, nonces, blockNumber] = await Promise.all([
        Promise.all(
          clean.map((a) =>
            client.readContract({
              address: ONE_REGISTRY_ADDRESS,
              abi: ONE_REGISTRY_ABI,
              functionName: "activeOneOf",
              args: [a],
            }),
          ),
        ),
        Promise.all(
          clean.map((a) =>
            client.readContract({
              address: ONE_REGISTRY_ADDRESS,
              abi: ONE_REGISTRY_ABI,
              functionName: "nonces",
              args: [a],
            }),
          ),
        ),
        client.getBlockNumber(),
      ]);

      return {
        members: clean.map((address, i) => ({
          address,
          activeOne: bindings[i] as string,
          nonce: (nonces[i] as bigint).toString(),
        })),
        blockNumber: blockNumber.toString(),
      };
    });

    return { ok: true, ...outcome.value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.split("\n")[0]! : String(error),
    };
  }
}

export type PredictionResult =
  | { ok: true; predicted: PortfolioAddress; occupied: boolean; membersHash: string }
  | { ok: false; error: string };

/** Asks the registry itself for the CREATE2 address, then checks it is free. */
export async function predictOneAddressAction(
  primary: string,
  sortedMembers: string[],
  salt: string,
): Promise<PredictionResult> {
  try {
    const outcome = await withRpcFallback(async (client) => {
      const [predicted, membersHash] = await Promise.all([
        client.readContract({
          address: ONE_REGISTRY_ADDRESS,
          abi: ONE_REGISTRY_ABI,
          functionName: "predictOneAddress",
          args: [
            getAddress(primary),
            sortedMembers.map((m) => getAddress(m)),
            salt as `0x${string}`,
          ],
        }),
        client.readContract({
          address: ONE_REGISTRY_ADDRESS,
          abi: ONE_REGISTRY_ABI,
          functionName: "membersHashOf",
          args: [sortedMembers.map((m) => getAddress(m))],
        }),
      ]);

      const address = getAddress(predicted as string) as PortfolioAddress;
      const code = await client.getCode({ address });
      return {
        predicted: address,
        occupied: Boolean(code && code !== "0x"),
        membersHash: membersHash as string,
      };
    });

    return { ok: true, ...outcome.value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.split("\n")[0]! : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Lookup and membership
// ---------------------------------------------------------------------------

export type LookupActionResult = LookupResult;

/**
 * Resolves a pasted address to a ONE identity. No wallet connection required —
 * this reads public Registry state only.
 */
export async function resolveOneLookupAction(input: string): Promise<LookupActionResult> {
  try {
    const outcome = await withRpcFallback((client) => resolveOneLookup(client, input));
    return outcome.value;
  } catch (error) {
    // Every endpoint failed. This is an RPC problem, never "not found".
    return {
      ok: false,
      code: "RPC_ERROR",
      message:
        LOOKUP_MESSAGES.RPC_ERROR +
        (error instanceof Error ? ` (${error.message.split("\n")[0]})` : ""),
    };
  }
}

export type MembershipActionResult =
  | { state: "linked"; oneAddress: PortfolioAddress; role: "primary" | "secondary"; isActive: boolean; memberCount: number }
  | { state: "unlinked" }
  | { state: "error"; message: string };

/** Reads the ONE a connected wallet already belongs to, and its role in it. */
export async function loadWalletMembershipAction(
  wallet: string,
): Promise<MembershipActionResult> {
  try {
    const outcome = await withRpcFallback((client) => loadWalletMembership(client, wallet));
    return outcome.value;
  } catch (error) {
    return {
      state: "error",
      message:
        "Monad could not be reached to check this wallet. " +
        (error instanceof Error ? error.message.split("\n")[0]! : String(error)),
    };
  }
}

export type ProfileActionResult =
  | {
      ok: true;
      profile: {
        address: PortfolioAddress;
        isActive: boolean;
        primary: PortfolioAddress;
        members: PortfolioAddress[];
        memberCount: number;
        registry: PortfolioAddress;
        blockNumber: string;
      };
    }
  | { ok: false; reason: "not-a-one" | "error"; message: string };

export async function loadProfileAction(address: string): Promise<ProfileActionResult> {
  try {
    const outcome = await withRpcFallback((client) => loadOneProfile(client, address));
    const result = outcome.value;

    if (result.status === "not-a-one") {
      return {
        ok: false,
        reason: "not-a-one",
        message: "That address was not created by the ONE registry.",
      };
    }
    if (result.status === "error") {
      return { ok: false, reason: "error", message: result.error };
    }

    return {
      ok: true,
      profile: {
        address: result.profile.address,
        isActive: result.profile.isActive,
        primary: result.profile.primary,
        members: result.profile.members,
        memberCount: result.profile.memberCount,
        registry: result.profile.registry,
        blockNumber: result.profile.blockNumber.toString(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message.split("\n")[0]! : String(error),
    };
  }
}
