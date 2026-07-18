/**
 * Wallet address list rules for the portfolio.
 *
 * Mirrors the constraints ONERegistry enforces on-chain (max five, no zero
 * address, no duplicates) so the unverified view and the verified view can
 * never accept a list the contract would reject.
 */

import { getAddress, isAddress } from "viem";
import { MAX_WALLETS } from "./chain";
import type { PortfolioAddress } from "./types";

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export type AddressRejection =
  | "empty"
  | "invalid"
  | "zero-address"
  | "duplicate"
  | "max-reached";

export type AddressValidation =
  | { ok: true; address: PortfolioAddress }
  | { ok: false; reason: AddressRejection; message: string };

const MESSAGES: Record<AddressRejection, string> = {
  empty: "Enter a wallet address.",
  invalid: "That is not a valid Monad address. It should be 0x followed by 40 hex characters.",
  "zero-address": "The zero address cannot be added.",
  duplicate: "That address is already in your list.",
  "max-reached": `You can view up to ${MAX_WALLETS} wallets at once.`,
};

const reject = (reason: AddressRejection): AddressValidation => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

/**
 * Validates a candidate address against the current list.
 *
 * Comparison is case-insensitive, so the same wallet cannot be added twice by
 * varying its checksum casing. Accepted addresses are returned checksummed.
 */
export function validateNewAddress(
  input: string,
  existing: readonly PortfolioAddress[],
): AddressValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) return reject("empty");
  if (!isAddress(trimmed, { strict: false })) return reject("invalid");

  const checksummed = getAddress(trimmed);
  if (checksummed === ZERO_ADDRESS) return reject("zero-address");

  const alreadyPresent = existing.some(
    (a) => a.toLowerCase() === checksummed.toLowerCase(),
  );
  if (alreadyPresent) return reject("duplicate");

  if (existing.length >= MAX_WALLETS) return reject("max-reached");

  return { ok: true, address: checksummed };
}

/** Normalises a stored list: checksums, drops invalid/zero/duplicates, caps at five. */
export function sanitizeAddressList(
  values: readonly unknown[],
): PortfolioAddress[] {
  const out: PortfolioAddress[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const validation = validateNewAddress(value, out);
    if (validation.ok) out.push(validation.address);
  }
  return out;
}

export function removeAddress(
  list: readonly PortfolioAddress[],
  target: PortfolioAddress,
): PortfolioAddress[] {
  return list.filter((a) => a.toLowerCase() !== target.toLowerCase());
}

/** Validates a collection contract address for the NFT checker. */
export function validateCollectionAddress(input: string): AddressValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) return reject("empty");
  if (!isAddress(trimmed, { strict: false })) return reject("invalid");
  const checksummed = getAddress(trimmed);
  if (checksummed === ZERO_ADDRESS) return reject("zero-address");
  return { ok: true, address: checksummed };
}
