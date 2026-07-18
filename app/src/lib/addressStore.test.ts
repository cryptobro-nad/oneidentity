import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getServerSnapshot,
  getSnapshot,
  resetAddressStoreCache,
  setAddresses,
  subscribe,
} from "./addressStore";
import type { PortfolioAddress } from "./types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

afterEach(() => {
  setAddresses([]);
  resetAddressStoreCache();
});

describe("address store", () => {
  it("returns a stable reference between reads, so React does not loop", () => {
    const first = getSnapshot();
    const second = getSnapshot();
    expect(first).toBe(second);
  });

  it("returns a new reference only after a change", () => {
    const before = getSnapshot();
    setAddresses([A]);
    const after = getSnapshot();
    expect(after).not.toBe(before);
    expect(after).toEqual([A]);
  });

  it("gives the server an empty, stable snapshot", () => {
    expect(getServerSnapshot()).toEqual([]);
    expect(getServerSnapshot()).toBe(getServerSnapshot());
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    setAddresses([A]);
    expect(listener).toHaveBeenCalledTimes(1);

    setAddresses([A, B]);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setAddresses([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("supports multiple subscribers", () => {
    const one = vi.fn();
    const two = vi.fn();
    const unsubOne = subscribe(one);
    const unsubTwo = subscribe(two);

    setAddresses([A]);

    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
    unsubOne();
    unsubTwo();
  });
});
