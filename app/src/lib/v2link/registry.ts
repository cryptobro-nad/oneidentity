/**
 * Server-side reads against the deployed ONERegistryV2 (and V1 for cross-checks).
 * Used by the challenge route (reject already-linked wallets) and the attestation
 * route (resolve the ONE identity address the attestation binds to).
 */

import { getAddress } from "viem";
import { withRpcFallback } from "@/lib/rpc";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import { ONE_REGISTRY_ABI } from "@/lib/registry/abi";
import type { PortfolioAddress } from "@/lib/types";

export const ONE_REGISTRY_V2_ADDRESS = process.env.NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS as
  | `0x${string}`
  | undefined;

/** The reads the V2 backend needs. Hand-written (kept in sync with the contract). */
export const ONE_REGISTRY_V2_READ_ABI = [
  {
    type: "function",
    name: "activeOneOf",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "one", type: "address" }],
  },
  {
    type: "function",
    name: "predictIdentityAddress",
    stateMutability: "view",
    inputs: [{ name: "primary", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "one", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "primaryOf",
    stateMutability: "view",
    inputs: [{ name: "one", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "membersOf",
    stateMutability: "view",
    inputs: [{ name: "one", type: "address" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "memberCountOf",
    stateMutability: "view",
    inputs: [{ name: "one", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [{ name: "one", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** The writes the launch UI needs: `approveLink` (link) and `removeMember`. */
export const ONE_REGISTRY_V2_WRITE_ABI = [
  {
    type: "function",
    name: "approveLink",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "att",
        type: "tuple",
        components: [
          { name: "primary", type: "address" },
          { name: "secondary", type: "address" },
          { name: "one", type: "address" },
          { name: "challengeId", type: "bytes32" },
          { name: "amount", type: "uint256" },
          { name: "txHash", type: "bytes32" },
          { name: "txBlock", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "verifierNonce", type: "uint256" },
        ],
      },
      { name: "verifierSig", type: "bytes" },
    ],
    outputs: [{ name: "one", type: "address" }],
  },
  {
    type: "function",
    name: "removeMember",
    stateMutability: "nonpayable",
    inputs: [
      { name: "one", type: "address" },
      { name: "wallet", type: "address" },
    ],
    outputs: [],
  },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/** True if the wallet is free in both V1 and V2. */
export async function walletIsFree(wallet: PortfolioAddress): Promise<boolean> {
  if (!ONE_REGISTRY_V2_ADDRESS) throw new Error("V2 registry address not configured");
  const outcome = await withRpcFallback(async (client) => {
    const [v1One, v2One] = await Promise.all([
      client.readContract({
        address: ONE_REGISTRY_ADDRESS,
        abi: ONE_REGISTRY_ABI,
        functionName: "activeOneOf",
        args: [getAddress(wallet)],
      }),
      client.readContract({
        address: ONE_REGISTRY_V2_ADDRESS!,
        abi: ONE_REGISTRY_V2_READ_ABI,
        functionName: "activeOneOf",
        args: [getAddress(wallet)],
      }),
    ]);
    return (v1One as string) === ZERO && (v2One as string) === ZERO;
  });
  return outcome.value;
}

/** The ONE identity address a link will land in: existing, or predicted for a first link. */
export async function resolveOneAddress(primary: PortfolioAddress): Promise<PortfolioAddress> {
  if (!ONE_REGISTRY_V2_ADDRESS) throw new Error("V2 registry address not configured");
  const outcome = await withRpcFallback(async (client) => {
    const existing = (await client.readContract({
      address: ONE_REGISTRY_V2_ADDRESS!,
      abi: ONE_REGISTRY_V2_READ_ABI,
      functionName: "activeOneOf",
      args: [getAddress(primary)],
    })) as string;
    if (existing !== ZERO) return existing;
    return (await client.readContract({
      address: ONE_REGISTRY_V2_ADDRESS!,
      abi: ONE_REGISTRY_V2_READ_ABI,
      functionName: "predictIdentityAddress",
      args: [getAddress(primary)],
    })) as string;
  });
  return getAddress(outcome.value) as PortfolioAddress;
}
