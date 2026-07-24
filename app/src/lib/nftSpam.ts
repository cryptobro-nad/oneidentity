/**
 * Conservative lure classification for NFT collections.
 *
 * A collection is routed to "Likely spam" ONLY when its own name carries an
 * unmistakable lure signal — a URL, a domain, a Telegram link, or a
 * claim/airdrop/voucher-style word. An unknown, unverified, or metadata-less
 * collection is NEVER spam on that basis alone; it stays in the normal table.
 */

const LURE_PATTERNS: RegExp[] = [
  /https?:\/\//i, // embedded URL
  /\bwww\./i,
  /\b[a-z0-9-]+\.(com|xyz|io|fi|app|net|org|fun|club|vip|site|link|live|gift|claims?)\b/i, // domain
  /\b(claim|airdrop|redeem|reward|voucher|giveaway|visit|bonus)\b/i, // lure words
  /connect\s*wallet/i, // "connect wallet" lure
  /t\.me\//i, // telegram link
];

/** True only for an unmistakable lure signal in the collection name. */
export function isLikelyNftSpam(name: string | null | undefined): boolean {
  const text = (name ?? "").trim();
  if (text.length === 0) return false; // missing metadata is never spam
  return LURE_PATTERNS.some((p) => p.test(text));
}
