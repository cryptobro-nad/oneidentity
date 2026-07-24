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

  it("returns the same active challenge for a pair (one active per pair, idempotent)", async () => {
    const store = new InMemoryChallengeStore();
    const a = await createChallenge(store, { primary: PRIMARY, secondary: SECONDARY }, baseDeps);
    const b = await createChallenge(store, { primary: PRIMARY, secondary: SECONDARY }, baseDeps);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.challenge.id).toBe(b.challenge.id);
  });

  it("generates a completely new challenge after the previous one expires", async () => {
    const store = new InMemoryChallengeStore();
    // Deterministic, distinct step indices so the two amounts are guaranteed
    // different (the point of the test is a fresh id + amount, not randomness).
    let step = 0n;
    const deps = { ...baseDeps, randomWei: () => step++ };
    const a = await createChallenge(store, { primary: PRIMARY, secondary: SECONDARY }, { ...deps, now: () => 1000 });
    // Advance past the 5-minute window.
    const b = await createChallenge(store, { primary: PRIMARY, secondary: SECONDARY }, { ...deps, now: () => 1000 + 301 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.challenge.id).not.toBe(b.challenge.id);
      expect(a.challenge.amountWei).not.toBe(b.challenge.amountWei);
    }
  });

  it("returns a clear conflict when the pair is already active (concurrent race)", async () => {
    const store = new InMemoryChallengeStore();
    // Simulate the race: the pre-check misses (returns null), but create() then
    // hits the active-pair unique index. Force it by pre-seeding an active one.
    await createChallenge(store, { primary: PRIMARY, secondary: SECONDARY }, baseDeps);
    // A store whose findActiveForPair lies (null) so createChallenge proceeds to
    // create() and must surface the DB conflict rather than a generic error.
    const racing = Object.assign(Object.create(Object.getPrototypeOf(store)), store, {
      findActiveForPair: async () => null,
    });
    const res = await createChallenge(racing, { primary: PRIMARY, secondary: SECONDARY }, baseDeps);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.conflict).toBe(true);
  });
});
