/**
 * The wallet list as an external store, read through `useSyncExternalStore`.
 *
 * localStorage is genuinely external state that does not exist during SSR, so
 * this is the shape React expects: a server snapshot (always empty), a client
 * snapshot backed by a stable cache, and a subscription that also picks up
 * changes made in another tab.
 *
 * The cache is what makes it safe — `getSnapshot` must return a referentially
 * stable value between changes or React will re-render forever.
 */

import { loadStoredAddresses, saveStoredAddresses, STORAGE_KEY } from "./storage";
import type { PortfolioAddress } from "./types";

const EMPTY: PortfolioAddress[] = [];

let cache: PortfolioAddress[] | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab editing the list should update this one.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    cache = null;
    emit();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function getSnapshot(): PortfolioAddress[] {
  if (cache === null) cache = loadStoredAddresses();
  return cache;
}

/** Always empty: the server cannot know what is in the user's browser. */
export function getServerSnapshot(): PortfolioAddress[] {
  return EMPTY;
}

export function setAddresses(next: PortfolioAddress[]): void {
  cache = next;
  saveStoredAddresses(next);
  emit();
}

/** Test-only: drops the cache so the next read hits storage again. */
export function resetAddressStoreCache(): void {
  cache = null;
}
