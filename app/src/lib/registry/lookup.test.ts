import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { resolveOneLookup, oneProfilePath, ZERO_ADDRESS } from "./lookup";
import type { PortfolioAddress } from "@/lib/types";

const ONE_ADDR = "0x1139dec3A681C96807D8C277601655A707494AaA" as PortfolioAddress;
const WALLET = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;
const STRANGER = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;

/** exists / activeOneOf responses, or an Error to throw. */
function mockClient(opts: {
  exists?: boolean | Error | unknown;
  activeOneOf?: string | Error | unknown;
} = {}) {
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "exists") {
      if (opts.exists instanceof Error) throw opts.exists;
      return opts.exists ?? false;
    }
    if (functionName === "activeOneOf") {
      if (opts.activeOneOf instanceof Error) throw opts.activeOneOf;
      return opts.activeOneOf ?? ZERO_ADDRESS;
    }
    throw new Error(`unexpected read: ${functionName}`);
  });
  return { readContract } as unknown as PublicClient & { readContract: typeof readContract };
}

describe("resolveOneLookup — identity resolution", () => {
  it("resolves an ACTIVE ONE identity through exists()", async () => {
    const client = mockClient({ exists: true });
    const result = await resolveOneLookup(client, ONE_ADDR);

    expect(result).toEqual({ ok: true, oneAddress: ONE_ADDR, resolvedFrom: "identity" });
    // activeOneOf must not be needed when exists() already answered.
    expect(client.readContract).toHaveBeenCalledTimes(1);
  });

  it("resolves an INACTIVE historical ONE identity through exists()", async () => {
    // exists() stays true for a deactivated ONE — that is precisely why it is
    // checked before activeOneOf, which would return zero for its members.
    const client = mockClient({ exists: true, activeOneOf: ZERO_ADDRESS });
    const result = await resolveOneLookup(client, ONE_ADDR);
    expect(result).toMatchObject({ ok: true, resolvedFrom: "identity" });
  });
});

describe("resolveOneLookup — wallet resolution", () => {
  it("resolves a linked wallet through activeOneOf()", async () => {
    const client = mockClient({ exists: false, activeOneOf: ONE_ADDR });
    const result = await resolveOneLookup(client, WALLET);
    expect(result).toEqual({ ok: true, oneAddress: ONE_ADDR, resolvedFrom: "wallet" });
  });

  it("returns NOT_FOUND when the wallet has no active ONE", async () => {
    const client = mockClient({ exists: false, activeOneOf: ZERO_ADDRESS });
    const result = await resolveOneLookup(client, STRANGER);
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("resolveOneLookup — input handling", () => {
  it("accepts a lowercase address", async () => {
    const client = mockClient({ exists: true });
    const result = await resolveOneLookup(client, ONE_ADDR.toLowerCase());
    expect(result).toMatchObject({ ok: true, oneAddress: ONE_ADDR });
  });

  it("accepts a mixed-case checksummed address", async () => {
    const client = mockClient({ exists: true });
    const result = await resolveOneLookup(client, ONE_ADDR);
    expect(result).toMatchObject({ ok: true, oneAddress: ONE_ADDR });
  });

  it("trims surrounding whitespace", async () => {
    const client = mockClient({ exists: true });
    const result = await resolveOneLookup(client, `   ${ONE_ADDR}\n `);
    expect(result).toMatchObject({ ok: true, oneAddress: ONE_ADDR });
  });

  it("normalises the returned address to checksummed form", async () => {
    const client = mockClient({ exists: false, activeOneOf: ONE_ADDR.toLowerCase() });
    const result = await resolveOneLookup(client, WALLET);
    expect(result).toMatchObject({ ok: true, oneAddress: ONE_ADDR });
  });
});

describe("resolveOneLookup — invalid input makes NO network call", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["not an address", "hello"],
    ["too short", "0x1234"],
    ["no 0x prefix", "1139dec3A681C96807D8C277601655A707494AaA"],
  ])("rejects %s without touching the Registry", async (_label, input) => {
    const client = mockClient({ exists: true });
    const result = await resolveOneLookup(client, input);

    expect(result).toMatchObject({ ok: false, code: "INVALID_ADDRESS" });
    expect(client.readContract).not.toHaveBeenCalled();
  });
});

describe("resolveOneLookup — failures are never NOT_FOUND", () => {
  it("returns RPC_ERROR when exists() throws", async () => {
    const client = mockClient({ exists: new Error("connection refused") });
    const result = await resolveOneLookup(client, ONE_ADDR);
    expect(result).toMatchObject({ ok: false, code: "RPC_ERROR" });
    if (result.ok) return;
    expect(result.code).not.toBe("NOT_FOUND");
  });

  it("returns RPC_ERROR when activeOneOf() throws", async () => {
    const client = mockClient({ exists: false, activeOneOf: new Error("timeout") });
    const result = await resolveOneLookup(client, WALLET);
    expect(result).toMatchObject({ ok: false, code: "RPC_ERROR" });
  });

  it("returns UNEXPECTED_ERROR for a non-boolean exists()", async () => {
    const client = mockClient({ exists: "yes" });
    const result = await resolveOneLookup(client, ONE_ADDR);
    expect(result).toMatchObject({ ok: false, code: "UNEXPECTED_ERROR" });
  });

  it("returns UNEXPECTED_ERROR for a malformed activeOneOf()", async () => {
    const client = mockClient({ exists: false, activeOneOf: "not-an-address" });
    const result = await resolveOneLookup(client, WALLET);
    expect(result).toMatchObject({ ok: false, code: "UNEXPECTED_ERROR" });
  });

  it("gives each failure a distinct, non-empty message", async () => {
    const codes = await Promise.all([
      resolveOneLookup(mockClient({ exists: true }), "nope"),
      resolveOneLookup(mockClient({ exists: false, activeOneOf: ZERO_ADDRESS }), STRANGER),
      resolveOneLookup(mockClient({ exists: new Error("x") }), ONE_ADDR),
      resolveOneLookup(mockClient({ exists: 42 }), ONE_ADDR),
    ]);
    const messages = codes.map((c) => (c.ok ? "" : c.message));
    expect(new Set(messages).size).toBe(4);
    for (const m of messages) expect(m.length).toBeGreaterThan(0);
  });
});

describe("oneProfilePath", () => {
  it("builds a root-relative profile path", () => {
    expect(oneProfilePath(ONE_ADDR)).toBe(`/one/${ONE_ADDR}`);
  });

  it("does not hardcode any host", () => {
    const path = oneProfilePath(ONE_ADDR);
    expect(path).not.toMatch(/oneidentity|vercel|localhost|https?:/);
  });
});
