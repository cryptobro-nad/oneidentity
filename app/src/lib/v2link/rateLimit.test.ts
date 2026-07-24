import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRateLimiter, clientIp } from "./rateLimit";

let limiter: InMemoryRateLimiter;
beforeEach(() => {
  limiter = new InMemoryRateLimiter();
});

describe("InMemoryRateLimiter", () => {
  it("allows up to capacity then denies with retry timing", async () => {
    const opts = { capacity: 3, refillPerSec: 0.5, now: 100 };
    expect((await limiter.check("k", opts)).allowed).toBe(true);
    expect((await limiter.check("k", opts)).allowed).toBe(true);
    expect((await limiter.check("k", opts)).allowed).toBe(true);
    const denied = await limiter.check("k", opts);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1); // ~1/0.5 = 2s
  });

  it("refills over time", async () => {
    expect((await limiter.check("k", { capacity: 1, refillPerSec: 1, now: 100 })).allowed).toBe(true);
    expect((await limiter.check("k", { capacity: 1, refillPerSec: 1, now: 100 })).allowed).toBe(false);
    expect((await limiter.check("k", { capacity: 1, refillPerSec: 1, now: 101 })).allowed).toBe(true);
  });

  it("keys are independent", async () => {
    const opts = { capacity: 1, refillPerSec: 0, now: 100 };
    expect((await limiter.check("a", opts)).allowed).toBe(true);
    expect((await limiter.check("b", opts)).allowed).toBe(true);
    expect((await limiter.check("a", opts)).allowed).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers the platform-set x-real-ip over a client-supplied x-forwarded-for", () => {
    const req = new Request("https://x/", {
      headers: { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to the first x-forwarded-for entry only when x-real-ip is absent", () => {
    const req = new Request("https://x/", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("returns 'unknown' when no address header is present", () => {
    expect(clientIp(new Request("https://x/"))).toBe("unknown");
  });
});
