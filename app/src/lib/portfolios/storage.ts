/**
 * Portfolio persistence and legacy migration.
 *
 * Only the watchlist itself is stored: schema version, portfolio ids, names,
 * addresses and which one is active. Balances, NFT holdings, block numbers,
 * loading states and errors are deliberately never written — they go stale the
 * instant they are saved, and a stale balance presented as current is worse
 * than no balance at all.
 *
 * Everything read back is re-validated. Stored JSON is user-writable in
 * practice (devtools, extensions, a corrupted write), so it is treated as
 * untrusted input rather than as data this module produced.
 */

import { sanitizeAddressList } from "@/lib/addresses";
import { MAX_WALLETS } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";
import {
  createPersonal,
  emptyState,
  generatePortfolioId,
  MAX_NAME_LENGTH,
  normalizePortfolioColor,
  PERSONAL_ID,
  PERSONAL_NAME,
  SCHEMA_VERSION,
  type Portfolio,
  type PortfolioState,
} from "./types";

export const PORTFOLIOS_KEY = "one.portfolios.v2";

/**
 * The pre-multi-portfolio key: a bare address array.
 * Read from exactly once, during migration, then removed.
 */
export const LEGACY_ADDRESSES_KEY = "one.portfolio.addresses.v1";

type MinimalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeStorage(): MinimalStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Coerces an unknown value into a valid Portfolio, or null if unusable. */
function normalisePortfolio(
  value: unknown,
  seenIds: Set<string>,
  seenNames: Set<string>,
): Portfolio | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : generatePortfolioId();
  // Deterministic on duplicate ids: the first wins, later ones are re-keyed.
  const uniqueId = seenIds.has(id) ? generatePortfolioId() : id;

  const rawName = typeof raw.name === "string" ? raw.name.trim() : "";
  // The default portfolio is renamable, so a stored name is honoured here as
  // for any other. Its identity is PERSONAL_ID, never the label. Only a
  // missing or blank name falls back, and for the default that fallback is
  // "Personal" rather than "Untitled".
  const fallback = uniqueId === PERSONAL_ID ? PERSONAL_NAME : "Untitled";
  const name = rawName.length > 0 ? rawName.slice(0, MAX_NAME_LENGTH) : fallback;

  // Deterministic on duplicate names: suffix rather than drop, so no addresses
  // are lost to a storage collision.
  let uniqueName = name;
  let suffix = 2;
  while (seenNames.has(uniqueName.toLowerCase())) {
    uniqueName = `${name} (${suffix++})`.slice(0, MAX_NAME_LENGTH);
  }

  const addresses = Array.isArray(raw.addresses)
    ? sanitizeAddressList(raw.addresses).slice(0, MAX_WALLETS)
    : [];

  seenIds.add(uniqueId);
  seenNames.add(uniqueName.toLowerCase());

  // Missing colour (pre-colour data) is coerced to the default green here, so
  // every portfolio read back has a valid colour without losing any addresses.
  return { id: uniqueId, name: uniqueName, addresses, color: normalizePortfolioColor(raw.color) };
}

/** Repairs any parsed value into a usable state. Never throws. */
export function normaliseState(value: unknown): PortfolioState {
  if (!value || typeof value !== "object") return emptyState();
  const raw = value as Record<string, unknown>;

  const list = Array.isArray(raw.portfolios) ? raw.portfolios : [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const portfolios: Portfolio[] = [];
  for (const entry of list) {
    const portfolio = normalisePortfolio(entry, seenIds, seenNames);
    if (portfolio) portfolios.push(portfolio);
  }

  // Personal must always exist.
  if (!portfolios.some((p) => p.id === PERSONAL_ID)) {
    portfolios.unshift(createPersonal());
  }

  // A missing or unknown active id falls back to Personal rather than to a
  // blank screen.
  const activeId =
    typeof raw.activeId === "string" && portfolios.some((p) => p.id === raw.activeId)
      ? raw.activeId
      : PERSONAL_ID;

  return { version: SCHEMA_VERSION, portfolios, activeId };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Moves a pre-existing single address list into Personal.
 *
 * Idempotent by construction: the legacy key is removed once its contents are
 * safely stored under the new key, so a second run finds nothing to do. The
 * legacy key is only removed after the new state is written, so an interrupted
 * migration retries rather than losing addresses.
 */
export function migrateLegacy(
  storage: MinimalStorage | undefined = safeStorage(),
): PortfolioState | null {
  if (!storage) return null;

  let legacyRaw: string | null = null;
  try {
    legacyRaw = storage.getItem(LEGACY_ADDRESSES_KEY);
  } catch {
    return null;
  }
  if (legacyRaw === null) return null;

  let addresses: PortfolioAddress[] = [];
  try {
    const parsed: unknown = JSON.parse(legacyRaw);
    // Only ever an address array. Anything else (including any balance data a
    // future bug might have written) is discarded rather than migrated.
    if (Array.isArray(parsed)) addresses = sanitizeAddressList(parsed).slice(0, MAX_WALLETS);
  } catch {
    addresses = [];
  }

  // Merge into whatever already exists rather than overwriting it.
  const existing = readState(storage);
  const next: PortfolioState = {
    ...existing,
    portfolios: existing.portfolios.map((p) =>
      p.id === PERSONAL_ID
        ? // Union, so re-running can never duplicate an address.
          {
            ...p,
            addresses: sanitizeAddressList([...p.addresses, ...addresses]).slice(0, MAX_WALLETS),
          }
        : p,
    ),
  };

  const written = writeState(next, storage);
  if (!written) return null;

  try {
    storage.removeItem(LEGACY_ADDRESSES_KEY);
  } catch {
    // Migration already succeeded; a failed cleanup is harmless because the
    // merge above is a union.
  }

  return next;
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

export function readState(storage: MinimalStorage | undefined = safeStorage()): PortfolioState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(PORTFOLIOS_KEY);
    if (!raw) return emptyState();
    return normaliseState(JSON.parse(raw));
  } catch {
    // Malformed JSON must never take the page down.
    return emptyState();
  }
}

export function writeState(
  state: PortfolioState,
  storage: MinimalStorage | undefined = safeStorage(),
): boolean {
  if (!storage) return false;
  try {
    // Persist only the watchlist fields, explicitly. Anything the caller may
    // have attached to the object is dropped here rather than trusted.
    const minimal: PortfolioState = {
      version: SCHEMA_VERSION,
      portfolios: state.portfolios.map((p) => ({
        id: p.id,
        name: p.name,
        addresses: p.addresses,
        color: normalizePortfolioColor(p.color),
      })),
      activeId: state.activeId,
    };
    storage.setItem(PORTFOLIOS_KEY, JSON.stringify(minimal));
    return true;
  } catch {
    // Quota or private mode must not break the flow.
    return false;
  }
}

/** Reads state, running the legacy migration first if one is pending. */
export function loadState(storage: MinimalStorage | undefined = safeStorage()): PortfolioState {
  const migrated = migrateLegacy(storage);
  return migrated ?? readState(storage);
}

export function clearAll(storage: MinimalStorage | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PORTFOLIOS_KEY);
  } catch {
    // ignore
  }
}
