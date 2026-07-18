/**
 * The Verified ONE draft as an external store, read via `useSyncExternalStore`.
 *
 * Same reasoning as `addressStore.ts`: localStorage is external state that does
 * not exist during SSR, so restoring it in an effect would both desync
 * hydration and trigger a cascading render. The server snapshot is an empty
 * draft; the client snapshot is cached so React sees a stable reference between
 * changes.
 */

import { clearDraft, emptyDraft, loadDraft, saveDraft, type OneDraft } from "./draft";

const SERVER_SNAPSHOT: OneDraft = Object.freeze({
  members: [],
  primary: null,
  salt: null,
  deadline: null,
  signatures: [],
  createdAt: 0,
}) as OneDraft;

let cache: OneDraft | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): OneDraft {
  if (cache === null) cache = loadDraft() ?? emptyDraft();
  return cache;
}

/** Always the same frozen empty draft — the server cannot know the user's draft. */
export function getServerSnapshot(): OneDraft {
  return SERVER_SNAPSHOT;
}

export function setDraft(next: OneDraft): void {
  cache = next;
  saveDraft(next);
  emit();
}

export function updateDraft(updater: (current: OneDraft) => OneDraft): OneDraft {
  const next = updater(getSnapshot());
  setDraft(next);
  return next;
}

export function resetDraft(): void {
  clearDraft();
  cache = emptyDraft();
  emit();
}

/** Test-only: drop the cache so the next read hits storage again. */
export function resetDraftStoreCache(): void {
  cache = null;
}
