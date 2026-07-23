/**
 * Named watch-only portfolios.
 *
 * A portfolio is a private list of addresses saved in one browser. It is not a
 * Verified ONE, not an onchain identity, and proves nothing about who controls
 * the wallets in it. Nothing here ever touches the Registry.
 */

import type { PortfolioAddress } from "@/lib/types";

/** Fixed id for the default portfolio, so it is identifiable across renames. */
export const PERSONAL_ID = "personal" as const;
export const PERSONAL_NAME = "Personal" as const;

export const MAX_NAME_LENGTH = 40;

/**
 * Curated palette for saved portfolios. A fixed set (never a free-form picker)
 * keeps every portfolio's accent tasteful and theme-safe. The colour is a purely
 * visual aid: it never affects wallet data, lookup, balances, or any logic.
 */
export const PORTFOLIO_COLORS = ["green", "violet", "blue", "amber", "rose", "teal"] as const;
export type PortfolioColor = (typeof PORTFOLIO_COLORS)[number];
export const DEFAULT_PORTFOLIO_COLOR: PortfolioColor = "green";

/** Missing or unknown colours (older saved data, hand-edited storage) → green. */
export function normalizePortfolioColor(value: unknown): PortfolioColor {
  return typeof value === "string" && (PORTFOLIO_COLORS as readonly string[]).includes(value)
    ? (value as PortfolioColor)
    : DEFAULT_PORTFOLIO_COLOR;
}

export type Portfolio = {
  id: string;
  name: string;
  addresses: PortfolioAddress[];
  /** Optional so pre-colour saved data and older code keep working; a missing
   *  value is treated as the default green everywhere it is read. */
  color?: PortfolioColor;
};

/** Current persisted shape. Bump `version` if this changes incompatibly. */
export type PortfolioState = {
  version: 2;
  portfolios: Portfolio[];
  activeId: string;
};

export const SCHEMA_VERSION = 2 as const;

export function isPersonal(id: string): boolean {
  return id === PERSONAL_ID;
}

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

export type NameRejection = "empty" | "too-long" | "duplicate";

export type NameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: NameRejection; message: string };

/**
 * Validates a portfolio name against the existing set.
 *
 * Comparison is case-insensitive and whitespace-trimmed, so "Trading",
 * "trading" and "  TRADING " are the same name. Without that, a user ends up
 * with several portfolios they cannot tell apart in the switcher.
 */
export function validatePortfolioName(
  input: string,
  existing: readonly Portfolio[],
  /** Ignore this id when checking duplicates, so a rename can keep its name. */
  ignoreId?: string,
): NameValidation {
  const name = input.trim();

  if (name.length === 0) {
    return { ok: false, reason: "empty", message: "Enter a name for this portfolio." };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      reason: "too-long",
      message: `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`,
    };
  }

  const clash = existing.some(
    (p) => p.id !== ignoreId && p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) {
    return {
      ok: false,
      reason: "duplicate",
      message: `You already have a portfolio called “${name}”.`,
    };
  }

  return { ok: true, name };
}

/**
 * Generates a stable, collision-resistant portfolio id.
 *
 * Ids are generated rather than derived from the name, so renaming keeps the
 * same portfolio and two portfolios can never collide through their names.
 */
export function generatePortfolioId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Older browsers: random enough for a per-browser local id.
  return `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function createPersonal(addresses: PortfolioAddress[] = []): Portfolio {
  return { id: PERSONAL_ID, name: PERSONAL_NAME, addresses, color: DEFAULT_PORTFOLIO_COLOR };
}

export function emptyState(): PortfolioState {
  return { version: SCHEMA_VERSION, portfolios: [createPersonal()], activeId: PERSONAL_ID };
}

export function activePortfolio(state: PortfolioState): Portfolio {
  return (
    state.portfolios.find((p) => p.id === state.activeId) ??
    state.portfolios.find((p) => p.id === PERSONAL_ID) ??
    state.portfolios[0]!
  );
}
