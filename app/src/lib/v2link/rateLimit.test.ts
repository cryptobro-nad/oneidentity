import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, clientKey, __resetRateLimits } from "./rateLimit";

beforeEach(() => __resetRateLimits());

describe("rateLimit", () => {
  it("allows up to capacity then blocks", () => {
    const opts = { capacity: 3, refillPerSec: 0, now: 100 };
    expect(rateLimit("k", opts)).toBe(true);
    expect(rateLimit("k", opts)).toBe(true);
    expect(rateLimit("k", opts)).toBe(true);
    expect(rateLimit("k", opts)).toBe(false); // exhausted, no refill
  });

  it("refills over time", () => {
    expect(rateLimit("k", { capacity: 1, refillPerSec: 1, now: 100 })).toBe(true);
    expect(rateLimit("k", { capacity: 1, refillPerSec: 1, now: 100 })).toBe(false);
    expect(rateLimit("k", { capacity: 1, refillPerSec: 1, now: 101 })).toBe(true); // 1s → +1 token
  });

  it("keys are independent", () => {
    const opts = { capacity: 1, refillPerSec: 0, now: 100 };
    expect(rateLimit("a", opts)).toBe(true);
    expect(rateLimit("b", opts)).toBe(true);
    expect(rateLimit("a", opts)).toBe(false);
  });

  it("derives a key from the forwarded IP", () => {
    const req = new Request("https://x/", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientKey(req, "scope")).toBe("scope:1.2.3.4");
  });
});
