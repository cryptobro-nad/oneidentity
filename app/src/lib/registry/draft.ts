/**
 * The Verified ONE draft, and the rules that invalidate collected signatures.
 *
 * A signature authorises one exact tuple:
 *   (wallet, primaryWallet, membersHash, salt, nonce, deadline)
 * bound to one exact domain (chainId, verifyingContract).
 *
 * If ANY of those inputs changes, the signature is worthless — it will recover
 * to a different address and revert on-chain. Rather than tracking each field
 * ad hoc, the draft derives a single `configFingerprint`; every stored
 * signature records the fingerprint it was made under, and a mismatch discards
 * it. That makes it structurally impossible to submit a signature from a stale
 * configuration.
 */

import { keccak256, toHex } from "viem";
import { MONAD_CHAIN_ID, ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";
import { computeMembersHash, sortMembers } from "./members";
import { isExpired } from "./eip712";

export type CollectedSignature = {
  wallet: PortfolioAddress;
  signature: `0x${string}`;
  /** The nonce that was signed. Re-checked against chain before submission. */
  nonce: string;
  deadline: string;
  /** Fingerprint of the config this was signed under. */
  configFingerprint: string;
  signedAt: number;
};

export type OneDraft = {
  members: PortfolioAddress[];
  primary: PortfolioAddress | null;
  salt: `0x${string}` | null;
  deadline: string | null;
  signatures: CollectedSignature[];
  createdAt: number;
};

export function emptyDraft(): OneDraft {
  return {
    members: [],
    primary: null,
    salt: null,
    deadline: null,
    signatures: [],
    createdAt: Date.now(),
  };
}

/**
 * Everything a signature commits to, hashed into one comparable value.
 *
 * Note what is included and why:
 *  - sorted members + membersHash : the member set being authorised
 *  - primary                      : who may submit
 *  - salt                         : binds this creation intent
 *  - deadline                     : part of the signed struct
 *  - chainId + registry           : the EIP-712 domain
 *
 * Nonces are deliberately NOT in the fingerprint. A nonce is per-signer and is
 * verified separately per signature, so folding it in would invalidate every
 * other wallet's signature whenever one signer's nonce advanced.
 */
export function configFingerprint(draft: OneDraft): string {
  const sorted = sortMembers(draft.members);
  const membersHash = sorted.length > 0 ? computeMembersHash(sorted) : "0x";
  return keccak256(
    toHex(
      JSON.stringify({
        chainId: MONAD_CHAIN_ID,
        registry: ONE_REGISTRY_ADDRESS.toLowerCase(),
        members: sorted.map((m) => m.toLowerCase()),
        membersHash,
        primary: draft.primary?.toLowerCase() ?? null,
        salt: draft.salt,
        deadline: draft.deadline,
      }),
    ),
  );
}

export type SignatureStatus =
  | { state: "valid"; signature: CollectedSignature }
  | { state: "stale-config"; signature: CollectedSignature }
  | { state: "expired"; signature: CollectedSignature }
  | { state: "missing" };

/** Status of one wallet's signature under the CURRENT draft configuration. */
export function signatureStatusFor(
  draft: OneDraft,
  wallet: PortfolioAddress,
  nowSeconds = Math.floor(Date.now() / 1000),
): SignatureStatus {
  const fingerprint = configFingerprint(draft);
  const found = draft.signatures.find(
    (s) => s.wallet.toLowerCase() === wallet.toLowerCase(),
  );
  if (!found) return { state: "missing" };
  if (found.configFingerprint !== fingerprint) {
    return { state: "stale-config", signature: found };
  }
  if (isExpired(BigInt(found.deadline), nowSeconds)) {
    return { state: "expired", signature: found };
  }
  return { state: "valid", signature: found };
}

/**
 * Drops every signature that no longer matches the current configuration.
 * Returns the pruned draft and whether anything was discarded, so the UI can
 * show the "configuration changed" warning exactly once per change.
 */
export function pruneInvalidSignatures(
  draft: OneDraft,
  nowSeconds = Math.floor(Date.now() / 1000),
): { draft: OneDraft; invalidated: CollectedSignature[] } {
  const fingerprint = configFingerprint(draft);
  const kept: CollectedSignature[] = [];
  const invalidated: CollectedSignature[] = [];

  for (const sig of draft.signatures) {
    const staleConfig = sig.configFingerprint !== fingerprint;
    const expired = isExpired(BigInt(sig.deadline), nowSeconds);
    // A wallet no longer in the set, or now the primary, must not keep a signature.
    const stillSecondary =
      draft.members.some((m) => m.toLowerCase() === sig.wallet.toLowerCase()) &&
      draft.primary !== null &&
      draft.primary.toLowerCase() !== sig.wallet.toLowerCase();

    if (staleConfig || expired || !stillSecondary) invalidated.push(sig);
    else kept.push(sig);
  }

  return { draft: { ...draft, signatures: kept }, invalidated };
}

/** Replaces any existing signature for the same wallet. */
export function upsertSignature(
  draft: OneDraft,
  signature: CollectedSignature,
): OneDraft {
  const others = draft.signatures.filter(
    (s) => s.wallet.toLowerCase() !== signature.wallet.toLowerCase(),
  );
  return { ...draft, signatures: [...others, signature] };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const DRAFT_STORAGE_KEY = "one.verified.draft.v1";

/**
 * Persists the draft locally.
 *
 * Signatures ARE stored, because losing them on a refresh would force every
 * secondary to re-sign — a far worse experience with no security gain (they are
 * already in the browser's memory and are not bearer credentials for funds).
 * They are pruned on load, cleared on config change, and cleared on success.
 * They are never sent to a server, never logged, and never placed in a URL.
 */
export function saveDraft(
  draft: OneDraft,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota or private mode must never break the flow.
  }
}

export function loadDraft(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
): OneDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OneDraft;
    if (!Array.isArray(parsed.members) || !Array.isArray(parsed.signatures)) return null;
    // Always prune on load: time has passed and the config may have been edited
    // in another tab.
    return pruneInvalidSignatures(parsed).draft;
  } catch {
    return null;
  }
}

export function clearDraft(
  storage: Pick<Storage, "removeItem"> | undefined = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function safeStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
