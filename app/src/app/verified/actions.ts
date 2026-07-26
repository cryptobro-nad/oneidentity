"use server";

/**
 * Read-only server actions for the Verified ONE flow.
 *
 * Chain reads run server-side: no CORS, one place to control endpoint choice and
 * failover. Nothing here can write to the chain. (V2 linking has its own actions
 * in v2actions.ts; identity creation is V2-only now.)
 */

import { withRpcFallback } from "@/lib/rpc";
import { loadOneProfile } from "@/lib/registry/profile";
import { LOOKUP_MESSAGES, resolveOneLookup, type LookupResult } from "@/lib/registry/lookup";
import type { PortfolioAddress } from "@/lib/types";

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
