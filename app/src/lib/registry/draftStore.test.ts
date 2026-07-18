import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getServerSnapshot,
  getSnapshot,
  resetDraft,
  resetDraftStoreCache,
  setDraft,
  subscribe,
  updateDraft,
} from "./draftStore";
import { emptyDraft } from "./draft";
import { sortMembers } from "./members";
import type { PortfolioAddress } from "@/lib/types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

afterEach(() => {
  resetDraft();
  resetDraftStoreCache();
});

describe("draft store", () => {
  it("returns a stable reference between reads so React does not loop", () => {
    expect(getSnapshot()).toBe(getSnapshot());
  });

  it("returns a new reference after a change", () => {
    const before = getSnapshot();
    setDraft({ ...emptyDraft(), members: sortMembers([A, B]) });
    expect(getSnapshot()).not.toBe(before);
    expect(getSnapshot().members).toHaveLength(2);
  });

  it("gives the server a stable empty snapshot", () => {
    expect(getServerSnapshot().members).toEqual([]);
    expect(getServerSnapshot()).toBe(getServerSnapshot());
  });

  it("never lets the server snapshot be mutated", () => {
    // Frozen so a stray write cannot leak one user's draft into SSR output.
    expect(Object.isFrozen(getServerSnapshot())).toBe(true);
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    setDraft({ ...emptyDraft(), members: [A] });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setDraft({ ...emptyDraft(), members: [A, B] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("updateDraft applies a function and returns the result", () => {
    const result = updateDraft((current) => ({ ...current, members: [A] }));
    expect(result.members).toEqual([A]);
    expect(getSnapshot().members).toEqual([A]);
  });

  it("resetDraft clears members and signatures", () => {
    setDraft({ ...emptyDraft(), members: sortMembers([A, B]), primary: A });
    resetDraft();
    expect(getSnapshot().members).toEqual([]);
    expect(getSnapshot().signatures).toEqual([]);
  });
});
