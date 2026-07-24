import { describe, expect, it } from "vitest";
import { validateTransfer, type ObservedTransfer } from "./verifyTransfer";
import type { Challenge } from "./types";

const PRIMARY = "0xB09684f5486d1af80699BbC27f14dd5A905da873";
const SECONDARY = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1";
const OTHER = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946";

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: "id-1",
  primary: PRIMARY as `0x${string}`,
  secondary: SECONDARY as `0x${string}`,
  amountWei: "15000000000000000", // 0.015 MON
  createdAt: 1000,
  createdAtBlock: 100n,
  expiresAt: 1300,
  status: "pending",
  ...over,
});

const tx = (over: Partial<ObservedTransfer> = {}): ObservedTransfer => ({
  hash: "0xabc" as `0x${string}`,
  from: SECONDARY as `0x${string}`,
  to: PRIMARY as `0x${string}`,
  value: 15000000000000000n,
  blockNumber: 110n,
  status: "success",
  ...over,
});

const ctx = { headBlock: 130n, confirmations: 8, now: 1100 };

describe("validateTransfer", () => {
  it("accepts a correct, confirmed, in-window transfer", () => {
    expect(validateTransfer(challenge(), tx(), ctx)).toEqual({ ok: true });
  });

  it("rejects a wrong sender", () => {
    expect(validateTransfer(challenge(), tx({ from: OTHER as `0x${string}` }), ctx)).toMatchObject({
      ok: false,
      reason: "wrong sender",
    });
  });

  it("rejects a wrong recipient", () => {
    expect(validateTransfer(challenge(), tx({ to: OTHER as `0x${string}` }), ctx)).toMatchObject({
      reason: "wrong recipient",
    });
  });

  it("rejects a wrong amount", () => {
    expect(validateTransfer(challenge(), tx({ value: 15000000000000001n }), ctx)).toMatchObject({
      reason: "wrong amount",
    });
  });

  it("rejects a failed transaction", () => {
    expect(validateTransfer(challenge(), tx({ status: "reverted" }), ctx)).toMatchObject({
      reason: "transaction failed",
    });
  });

  it("rejects a transfer that predates the challenge", () => {
    expect(validateTransfer(challenge(), tx({ blockNumber: 100n }), ctx)).toMatchObject({
      reason: "transfer predates challenge",
    });
  });

  it("rejects an insufficiently-confirmed transfer", () => {
    // headBlock 130, confirmations 8 → safe height 122; block 125 is too fresh.
    expect(validateTransfer(challenge(), tx({ blockNumber: 125n }), ctx)).toMatchObject({
      reason: "insufficient confirmations",
    });
  });

  it("rejects once the challenge has expired", () => {
    expect(validateTransfer(challenge(), tx(), { ...ctx, now: 1300 })).toMatchObject({
      reason: "challenge expired",
    });
  });

  it("rejects a non-pending challenge", () => {
    expect(validateTransfer(challenge({ status: "verified" }), tx(), ctx)).toMatchObject({
      reason: "challenge not pending",
    });
  });
});
