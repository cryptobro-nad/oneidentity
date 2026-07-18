/**
 * Display formatting.
 *
 * Rule: never round a balance up, and never render a failed read as a number.
 * Truncation (not rounding) keeps the displayed value a lower bound of what the
 * wallet actually holds.
 */

import { formatUnits } from "viem";

/**
 * Formats a raw on-chain amount for display.
 *
 * Truncates rather than rounds, groups the integer part with thin separators,
 * and trims trailing zeros so "1.500000" reads as "1.5".
 */
export function formatAmount(
  raw: bigint,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const full = formatUnits(raw, decimals);
  const [intPart = "0", fracPart = ""] = full.split(".");

  const grouped = BigInt(intPart).toLocaleString("en-US");

  if (maxFractionDigits === 0 || fracPart.length === 0) return grouped;

  const truncated = fracPart.slice(0, maxFractionDigits).replace(/0+$/, "");
  if (truncated.length === 0) {
    // A non-zero amount smaller than one display unit must not read as "0".
    if (raw > 0n && BigInt(intPart) === 0n) {
      return `< 0.${"0".repeat(maxFractionDigits - 1)}1`;
    }
    return grouped;
  }
  return `${grouped}.${truncated}`;
}

/** `0x1234…abcd` — short enough to scan, long enough to recognise. */
export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Stable label for a wallet in the breakdown: "Wallet A", "Wallet B", … */
export function walletLabel(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return `Wallet ${letters[index % letters.length]}`;
}

export function formatBlockNumber(block: bigint): string {
  return block.toLocaleString("en-US");
}

/** Fixed-format UTC timestamp — avoids server/client locale hydration drift. */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

export function formatCount(n: bigint): string {
  return n.toLocaleString("en-US");
}

export function pluralise(n: bigint, singular: string, plural?: string): string {
  return n === 1n ? singular : (plural ?? `${singular}s`);
}
