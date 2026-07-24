import { describe, expect, it } from "vitest";
import { InMemoryChallengeStore } from "./store";
import { challengeIdBytes32, createChallenge, generateAmountWei } from "./challenge";

const PRIMARY = "0xB09684f5486d1af80699BbC27f14dd5A905da873";
const SECONDARY = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1";

const baseDeps = {
  now: () => 1000,
  currentBlock: async () => 500n,
  uuid: (() => {
    let n = 0;
    return () => `id-${++n}`;
  })(),
};

describe("generateAmountWei", () => {
  it("produces amounts in [0.01, 0.1) MON", () => {
    for (let i = 0; i < 200; i++) {
      const a = generateAmountWei();
      expect(a >= 10n ** 16n).toBe(true);
      expect(a < 10n ** 17n).toBe(true);
    }
  });
});

describe("challengeIdBytes32", () => {
  it("is deterministic and 32 bytes", () => {
    const a = challengeIdBytes32("id-1");
    expect(a).toBe(challengeIdBytes32("id-1"));
    expect(a).not.toBe(challengeIdBytes32("id-2"));
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("createChallenge", () => {
  it("creates a pending challenge with a 5-minute expiry and the current block", async () => {
    const store = new InMemoryChallengeStore();
    const res = await createChallenge(store, { primary: PRIMARY, secondary: SECONDARY }, baseDeps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const c = res.challenge;
    expect(c.status).toBe("pending");
    expect(c.createdAtBlock).toBe(500n);
    expect(c.expiresAt).toBe(1000 + 300);
    expect(BigInt(c.amountWei) >= 10n ** 16n).toBe(true);
  });

  it("rejects identical primary and secondary", async () => {
    const store = new InMemoryChallengeStore();
    const res = await createChallenge(store, { primary: PRIMARY, secondary: PRIMARY }, baseDeps);
    expect(res.ok).toBe(false);
  });

  it("rejects invalid addresses", async () => {
    const store = new InMemoryChallengeStore();
    const res = await createChallenge(store, { primary: "0xnope", secondary: SECONDARY }, baseDeps);
    expect(res.ok).toBe(false);
  });

  it("never reuses an amount already active for the same pair", async () => {
    const store = new InMemoryChallengeStore();
    // randomWei returns the same value twice, then a fresh one → must retry.
    const seq = [42n, 42n, 99n];
    let i = 0;
    const deps = { ...baseDeps, randomWei: () => seq[Math.min(i++, seq.length - 1)]! };
    const a = await createChallenge(store, { primary: PRIMARY, secondary: SECONDARY }, deps);
    const b = await createChallenge(store, { primary: PRIMARY, secondary: SECONDARY }, deps);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.challenge.amountWei).not.toBe(b.challenge.amountWei);
  });
});
