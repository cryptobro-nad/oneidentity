/**
 * Portfolio state as an external store, read via `useSyncExternalStore`.
 *
 * Same pattern as the address and draft stores: localStorage is external state
 * that does not exist during SSR, so the server snapshot is a frozen default
 * and the client snapshot is cached for referential stability.
 */

import { removeAddress, validateNewAddress } from "@/lib/addresses";
import type { PortfolioAddress } from "@/lib/types";
import { loadState, writeState } from "./storage";
import {
  activePortfolio,
  emptyState,
  generatePortfolioId,
  PERSONAL_ID,
  validatePortfolioName,
  type Portfolio,
  type PortfolioState,
} from "./types";

const SERVER_SNAPSHOT: PortfolioState = Object.freeze({
  version: 2,
  portfolios: Object.freeze([
    Object.freeze({ id: PERSONAL_ID, name: "Personal", addresses: Object.freeze([]) }),
  ]),
  activeId: PERSONAL_ID,
}) as unknown as PortfolioState;

let cache: PortfolioState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): PortfolioState {
  // Migration runs on first read, so an existing user's wallets appear in
  // Personal without any explicit action.
  if (cache === null) cache = loadState();
  return cache;
}

/** Always the same frozen default — the server cannot know the user's lists. */
export function getServerSnapshot(): PortfolioState {
  return SERVER_SNAPSHOT;
}

function commit(next: PortfolioState): PortfolioState {
  cache = next;
  writeState(next);
  emit();
  return next;
}

function current(): PortfolioState {
  return getSnapshot();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function getActive(): Portfolio {
  return activePortfolio(current());
}

// ---------------------------------------------------------------------------
// Portfolio operations
// ---------------------------------------------------------------------------

export type PortfolioActionResult =
  | { ok: true; state: PortfolioState; id: string }
  | { ok: false; message: string };

export function createPortfolio(name: string): PortfolioActionResult {
  const state = current();
  const validation = validatePortfolioName(name, state.portfolios);
  if (!validation.ok) return { ok: false, message: validation.message };

  const portfolio: Portfolio = {
    id: generatePortfolioId(),
    name: validation.name,
    addresses: [],
  };

  // A new portfolio becomes active immediately: creating one is an explicit
  // request to work in it.
  const next = commit({
    ...state,
    portfolios: [...state.portfolios, portfolio],
    activeId: portfolio.id,
  });

  return { ok: true, state: next, id: portfolio.id };
}

export function renamePortfolio(id: string, name: string): PortfolioActionResult {
  const state = current();
  // Personal is fixed, so there is no rename affordance and no way to reach one.
  if (id === PERSONAL_ID) {
    return { ok: false, message: "The Personal portfolio cannot be renamed." };
  }
  if (!state.portfolios.some((p) => p.id === id)) {
    return { ok: false, message: "That portfolio no longer exists." };
  }

  const validation = validatePortfolioName(name, state.portfolios, id);
  if (!validation.ok) return { ok: false, message: validation.message };

  const next = commit({
    ...state,
    // Same id, same addresses — only the label changes.
    portfolios: state.portfolios.map((p) =>
      p.id === id ? { ...p, name: validation.name } : p,
    ),
  });

  return { ok: true, state: next, id };
}

export function deletePortfolio(id: string): PortfolioActionResult {
  const state = current();
  if (id === PERSONAL_ID) {
    return { ok: false, message: "The Personal portfolio cannot be deleted." };
  }
  if (!state.portfolios.some((p) => p.id === id)) {
    return { ok: false, message: "That portfolio no longer exists." };
  }

  const portfolios = state.portfolios.filter((p) => p.id !== id);
  const next = commit({
    ...state,
    portfolios,
    // Deleting the active portfolio returns to Personal rather than leaving
    // nothing selected.
    activeId: state.activeId === id ? PERSONAL_ID : state.activeId,
  });

  return { ok: true, state: next, id: PERSONAL_ID };
}

export function setActivePortfolio(id: string): PortfolioActionResult {
  const state = current();
  if (!state.portfolios.some((p) => p.id === id)) {
    return { ok: false, message: "That portfolio no longer exists." };
  }
  return { ok: true, state: commit({ ...state, activeId: id }), id };
}

// ---------------------------------------------------------------------------
// Address operations — always scoped to one portfolio
// ---------------------------------------------------------------------------

export type AddressActionResult = { ok: true } | { ok: false; message: string };

export function addAddressTo(portfolioId: string, input: string): AddressActionResult {
  const state = current();
  const portfolio = state.portfolios.find((p) => p.id === portfolioId);
  if (!portfolio) return { ok: false, message: "That portfolio no longer exists." };

  // Duplicates are rejected within a portfolio, but the same address is
  // perfectly valid in another — these are organisational watchlists.
  const validation = validateNewAddress(input, portfolio.addresses);
  if (!validation.ok) return { ok: false, message: validation.message };

  commit({
    ...state,
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId ? { ...p, addresses: [...p.addresses, validation.address] } : p,
    ),
  });

  return { ok: true };
}

export function removeAddressFrom(portfolioId: string, address: PortfolioAddress): void {
  const state = current();
  commit({
    ...state,
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId ? { ...p, addresses: removeAddress(p.addresses, address) } : p,
    ),
  });
}

export function clearAddressesIn(portfolioId: string): void {
  const state = current();
  commit({
    ...state,
    portfolios: state.portfolios.map((p) =>
      p.id === portfolioId ? { ...p, addresses: [] } : p,
    ),
  });
}

/** Test-only: drops the cache so the next read hits storage again. */
export function resetPortfolioStoreCache(): void {
  cache = null;
}

/** Test-only: replaces state outright. */
export function __setStateForTests(state: PortfolioState = emptyState()): void {
  commit(state);
}
