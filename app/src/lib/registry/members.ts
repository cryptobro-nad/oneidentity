/**
 * Member-set rules, mirrored exactly from ONERegistry._validateMemberList.
 *
 * The contract is the authority. Anything this module accepts that the contract
 * would reject wastes a transaction; anything it rejects that the contract would
 * accept blocks a legitimate user. Every rule below cites its Solidity source.
 */

import { encodeAbiParameters, getAddress, isAddress, keccak256 } from "viem";
import type { PortfolioAddress } from "@/lib/types";

/** ONERegistry.MIN_MEMBERS / MAX_MEMBERS — confirmed live on the deployed contract. */
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 5;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export type MemberRejection =
  | "empty"
  | "invalid"
  | "zero-address"
  | "duplicate"
  | "max-reached";

export type MemberValidation =
  | { ok: true; address: PortfolioAddress }
  | { ok: false; reason: MemberRejection; message: string };

const MESSAGES: Record<MemberRejection, string> = {
  empty: "Enter a wallet address.",
  invalid: "That is not a valid address. It should be 0x followed by 40 hex characters.",
  "zero-address": "The zero address cannot be a member.",
  duplicate: "That wallet is already in this ONE.",
  "max-reached": `A ONE can have at most ${MAX_MEMBERS} wallets.`,
};

const reject = (reason: MemberRejection): MemberValidation => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

export function validateMemberAddress(
  input: string,
  existing: readonly PortfolioAddress[],
): MemberValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) return reject("empty");
  if (!isAddress(trimmed, { strict: false })) return reject("invalid");

  const checksummed = getAddress(trimmed);
  // ONERegistry._validateMemberList rejects address(0) explicitly, because
  // strict ascending ordering alone would happily accept it (it sorts first).
  if (checksummed === ZERO_ADDRESS) return reject("zero-address");

  // Duplicate is reported before max-reached: telling a user the list is full
  // when they re-added an existing wallet would be actively misleading.
  if (existing.some((a) => a.toLowerCase() === checksummed.toLowerCase())) {
    return reject("duplicate");
  }
  if (existing.length >= MAX_MEMBERS) return reject("max-reached");

  return { ok: true, address: checksummed };
}

/**
 * Sorts members in strictly ascending NUMERIC order, as the contract requires.
 *
 * Critical: the comparison is numeric on the 160-bit value, not lexicographic
 * on the checksummed string. Checksummed addresses mix cases, so a plain
 * string sort puts "0xB0.." before "0xa1.." and the contract would revert with
 * UnsortedMembers. Comparing lowercased hex of equal length is equivalent to
 * comparing the integers, which is what Solidity's `<` does on `address`.
 *
 * Output is checksummed. On-chain this is irrelevant (address encoding drops
 * case), but normalising here means the sorted list, the UI and the calldata
 * always show the same strings, so array comparisons cannot fail on casing.
 */
export function sortMembers(members: readonly PortfolioAddress[]): PortfolioAddress[] {
  return [...members]
    .map((m) => getAddress(m) as PortfolioAddress)
    .sort((a, b) => {
      const left = a.toLowerCase();
      const right = b.toLowerCase();
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });
}

/** True if already strictly ascending with no duplicates. */
export function isStrictlySorted(members: readonly PortfolioAddress[]): boolean {
  for (let i = 1; i < members.length; i++) {
    if (members[i]!.toLowerCase() <= members[i - 1]!.toLowerCase()) return false;
  }
  return true;
}

/**
 * keccak256(abi.encode(sortedMembers)) — the contract's membersHash.
 *
 * Must use abi.encode semantics, NOT encodePacked: `abi.encode` of a dynamic
 * array emits a 32-byte offset word, a 32-byte length word, then the elements.
 * Concatenating the addresses would produce a different hash and every
 * signature would fail to recover.
 */
export function computeMembersHash(sortedMembers: readonly PortfolioAddress[]): `0x${string}` {
  return keccak256(
    encodeAbiParameters([{ type: "address[]" }], [sortedMembers as `0x${string}`[]]),
  );
}

export type MemberSetProblem =
  | { kind: "too-few"; count: number }
  | { kind: "too-many"; count: number }
  | { kind: "zero-address"; index: number }
  | { kind: "duplicate"; address: PortfolioAddress }
  | { kind: "unsorted" }
  | { kind: "primary-not-member"; primary: PortfolioAddress };

/**
 * Full pre-flight validation of a member set + primary, matching the order the
 * contract checks so the UI surfaces the same failure the chain would.
 */
export function validateMemberSet(
  sortedMembers: readonly PortfolioAddress[],
  primary: PortfolioAddress | null,
): MemberSetProblem[] {
  const problems: MemberSetProblem[] = [];

  if (sortedMembers.length < MIN_MEMBERS) {
    problems.push({ kind: "too-few", count: sortedMembers.length });
  }
  if (sortedMembers.length > MAX_MEMBERS) {
    problems.push({ kind: "too-many", count: sortedMembers.length });
  }

  sortedMembers.forEach((member, index) => {
    if (member === ZERO_ADDRESS) problems.push({ kind: "zero-address", index });
  });

  const seen = new Set<string>();
  for (const member of sortedMembers) {
    const key = member.toLowerCase();
    if (seen.has(key)) problems.push({ kind: "duplicate", address: member });
    seen.add(key);
  }

  if (!isStrictlySorted(sortedMembers)) problems.push({ kind: "unsorted" });

  // ONERegistry._requireAllWalletsFree reverts PrimaryNotInMemberList if
  // msg.sender is not in the list.
  if (primary && !sortedMembers.some((m) => m.toLowerCase() === primary.toLowerCase())) {
    problems.push({ kind: "primary-not-member", primary });
  }

  return problems;
}

/** Secondaries, in the sorted order the contract walks — the auths array order. */
export function secondariesInOrder(
  sortedMembers: readonly PortfolioAddress[],
  primary: PortfolioAddress,
): PortfolioAddress[] {
  return sortedMembers.filter((m) => m.toLowerCase() !== primary.toLowerCase());
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
