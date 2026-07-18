/**
 * EIP-712 `JoinOne` typed data.
 *
 * The domain and struct here must match ONERegistry byte-for-byte. Any drift
 * produces a signature that recovers to the wrong address and reverts with
 * InvalidSignature — after the user has already approved it in their wallet.
 *
 * Verified against the deployed contract:
 *   JOIN_ONE_TYPEHASH = 0xb374db42013b92adfb78ac6714742925733494dfad7bb318eed19df9edeee2ba
 *   domainSeparator   = 0x960c5a75782e99137e7ed08ee5f3b96ce7f2a37516829ba3541f78e21141e184
 */

import { keccak256, toHex, type TypedDataDomain } from "viem";
import { MONAD_CHAIN_ID, ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";

/**
 * Field order is load-bearing: the typehash is the keccak of the encoded type
 * string, so reordering these silently changes the hash.
 *
 *   JoinOne(address wallet,address primaryWallet,bytes32 membersHash,
 *           bytes32 salt,uint256 nonce,uint256 deadline)
 */
export const JOIN_ONE_TYPES = {
  JoinOne: [
    { name: "wallet", type: "address" },
    { name: "primaryWallet", type: "address" },
    { name: "membersHash", type: "bytes32" },
    { name: "salt", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const JOIN_ONE_TYPE_STRING =
  "JoinOne(address wallet,address primaryWallet,bytes32 membersHash,bytes32 salt,uint256 nonce,uint256 deadline)";

/** Must equal the on-chain JOIN_ONE_TYPEHASH(). Asserted in tests. */
export const JOIN_ONE_TYPEHASH = keccak256(toHex(JOIN_ONE_TYPE_STRING));

export const ONE_DOMAIN: TypedDataDomain = {
  name: "ONE",
  version: "1",
  chainId: MONAD_CHAIN_ID,
  verifyingContract: ONE_REGISTRY_ADDRESS,
};

export type JoinOneMessage = {
  wallet: PortfolioAddress;
  primaryWallet: PortfolioAddress;
  membersHash: `0x${string}`;
  salt: `0x${string}`;
  nonce: bigint;
  deadline: bigint;
};

export type JoinOneTypedData = {
  domain: TypedDataDomain;
  types: typeof JOIN_ONE_TYPES;
  primaryType: "JoinOne";
  message: JoinOneMessage;
};

export function buildJoinOneTypedData(message: JoinOneMessage): JoinOneTypedData {
  return {
    domain: ONE_DOMAIN,
    types: JOIN_ONE_TYPES,
    primaryType: "JoinOne",
    message,
  };
}

/**
 * A cryptographically secure random bytes32 salt.
 *
 * Deliberately not derived from a timestamp: the salt feeds the CREATE2 address
 * and the creationSaltUsed guard, so a predictable salt lets someone else
 * front-run the exact (primary, membersHash, salt) intent and burn it.
 */
export function generateSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Default signing window. Short enough to bound risk, long enough to sign 4 wallets. */
export const DEFAULT_DEADLINE_MINUTES = 45;

export function deadlineFromNow(minutes = DEFAULT_DEADLINE_MINUTES): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
}

export function isExpired(deadline: bigint, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  // ONERegistry._verifyJoin: `if (block.timestamp > auth.deadline) revert`.
  // Equal is still valid on-chain, so only strictly-greater is expired.
  return BigInt(nowSeconds) > deadline;
}
