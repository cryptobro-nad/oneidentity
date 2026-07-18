/**
 * Address-list persistence across navigation and refresh.
 *
 * Only the addresses are stored — never balances, which would go stale and
 * could be mistaken for live data. Everything is re-validated on read, so a
 * hand-edited or corrupted entry cannot get into the app.
 */

import { sanitizeAddressList } from "./addresses";
import type { PortfolioAddress } from "./types";

export const STORAGE_KEY = "one.portfolio.addresses.v1";

export function loadStoredAddresses(
  storage: Pick<Storage, "getItem"> | undefined = safeLocalStorage(),
): PortfolioAddress[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sanitizeAddressList(parsed);
  } catch {
    return [];
  }
}

export function saveStoredAddresses(
  addresses: readonly PortfolioAddress[],
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeLocalStorage(),
): void {
  if (!storage) return;
  try {
    if (addresses.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  } catch {
    // Private browsing or a full quota must never break the page.
  }
}

function safeLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
