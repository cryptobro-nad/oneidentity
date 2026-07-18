import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { loadOneProfile, mayAggregate, type OneProfile } from "./profile";
import { canRemove, removalCausesDeactivation, simulateRemoval, confirmRemoval } from "./removal";
import type { PortfolioAddress } from "@/lib/types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;
const C = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946" as PortfolioAddress;
const ONE_ADDR = "0xCC271e02D2a734F853768b78E9B9f813D8f7A869" as PortfolioAddress;
const ZERO = "0x0000000000000000000000000000000000000000";

function mockClient(opts: {
  exists?: boolean;
  isActive?: boolean;
  primary?: string;
  members?: string[];
  memberCount?: bigint;
  bindings?: Record<string, string>;
  throwOn?: string;
  simulateThrows?: Error;
} = {}): PublicClient {
  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (opts.throwOn === functionName) throw new Error("read failed");
      switch (functionName) {
        case "exists":
          return opts.exists ?? true;
        case "isActive":
          return opts.isActive ?? true;
        case "primaryOf":
          return opts.primary ?? A;
        case "membersOf":
          return opts.members ?? [B, A];
        case "memberCountOf":
          return opts.memberCount ?? 2n;
        case "activeOneOf":
          return opts.bindings?.[(args?.[0] as string).toLowerCase()] ?? ZERO;
        default:
          throw new Error(`unexpected read ${functionName}`);
      }
    }),
    getBlockNumber: vi.fn(async () => 88_632_853n),
    getGasPrice: vi.fn(async () => 102_000_000_000n),
    estimateGas: vi.fn(async () => 53_117n),
    simulateContract: vi.fn(async () => {
      if (opts.simulateThrows) throw opts.simulateThrows;
      return { result: undefined };
    }),
  } as unknown as PublicClient;
}

function profile(overrides: Partial<OneProfile> = {}): OneProfile {
  return {
    address: ONE_ADDR,
    exists: true,
    isActive: true,
    primary: A,
    members: [B, A],
    memberCount: 2,
    registry: "0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915" as PortfolioAddress,
    blockNumber: 88_632_853n,
    ...overrides,
  };
}

describe("loadOneProfile", () => {
  it("loads an active profile", async () => {
    const result = await loadOneProfile(mockClient(), ONE_ADDR);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.profile.isActive).toBe(true);
    expect(result.profile.memberCount).toBe(2);
    expect(result.profile.primary).toBe(A);
  });

  it("loads an inactive profile with its history intact", async () => {
    const client = mockClient({ isActive: false, members: [A], memberCount: 1n });
    const result = await loadOneProfile(client, ONE_ADDR);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.profile.isActive).toBe(false);
    expect(result.profile.members).toEqual([A]);
    expect(result.profile.primary).toBe(A);
  });

  it("reports not-a-one without calling other reads", async () => {
    const client = mockClient({ exists: false });
    const result = await loadOneProfile(client, ONE_ADDR);
    expect(result.status).toBe("not-a-one");
    // Only exists() should have been called; the rest revert UnknownOne on-chain.
    const calls = (client.readContract as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
  });

  it("rejects a malformed address without hitting the chain", async () => {
    const client = mockClient();
    const result = await loadOneProfile(client, "not-an-address");
    expect(result.status).toBe("not-a-one");
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("surfaces read errors rather than pretending the ONE is empty", async () => {
    const result = await loadOneProfile(mockClient({ throwOn: "exists" }), ONE_ADDR);
    expect(result.status).toBe("error");
  });
});

describe("mayAggregate", () => {
  it("allows aggregation for an active multi-member ONE", () => {
    expect(mayAggregate(profile())).toBe(true);
  });

  it("blocks aggregation for an inactive ONE", () => {
    // ONEIdentity reverts InactiveIdentity; calling it would surface a raw
    // revert and the "combined" total would be the lone primary's balance.
    expect(mayAggregate(profile({ isActive: false, memberCount: 1 }))).toBe(false);
  });

  it("blocks aggregation when only one member remains even if flagged active", () => {
    expect(mayAggregate(profile({ isActive: true, memberCount: 1 }))).toBe(false);
  });
});

describe("canRemove", () => {
  it("lets a secondary remove itself", () => {
    expect(canRemove(profile(), B, B)).toEqual({ allowed: true, reason: "self" });
  });

  it("lets the primary remove a secondary", () => {
    expect(canRemove(profile(), B, A)).toEqual({
      allowed: true,
      reason: "primary-removes-secondary",
    });
  });

  it("never allows removing the primary", () => {
    expect(canRemove(profile(), A, A)).toEqual({
      allowed: false,
      reason: "primary-cannot-be-removed",
    });
  });

  it("blocks one secondary removing another", () => {
    const p = profile({ members: [B, C, A], memberCount: 3 });
    expect(canRemove(p, C, B)).toEqual({ allowed: false, reason: "not-authorized" });
  });

  it("blocks an unrelated wallet", () => {
    expect(canRemove(profile(), B, C)).toEqual({ allowed: false, reason: "not-authorized" });
  });

  it("blocks when no wallet is connected", () => {
    expect(canRemove(profile(), B, null)).toEqual({ allowed: false, reason: "not-connected" });
  });

  it("blocks removal on an inactive ONE", () => {
    expect(canRemove(profile({ isActive: false }), B, A)).toEqual({
      allowed: false,
      reason: "inactive",
    });
  });

  it("blocks removing a non-member", () => {
    expect(canRemove(profile(), C, A)).toEqual({ allowed: false, reason: "not-a-member" });
  });

  it("is case-insensitive", () => {
    expect(canRemove(profile(), B, B.toLowerCase()).allowed).toBe(true);
  });
});

describe("removalCausesDeactivation", () => {
  it("is true when removing the last secondary", () => {
    expect(removalCausesDeactivation(profile(), B)).toBe(true);
  });

  it("is false when secondaries remain", () => {
    const p = profile({ members: [B, C, A], memberCount: 3 });
    expect(removalCausesDeactivation(p, B)).toBe(false);
  });

  it("is false for the primary, which cannot be removed at all", () => {
    expect(removalCausesDeactivation(profile(), A)).toBe(false);
  });
});

describe("simulateRemoval", () => {
  it("returns a gas plan and flags deactivation", async () => {
    const result = await simulateRemoval(mockClient(), {
      profile: profile(),
      target: B,
      account: A,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.gasPlan.estimatedGas).toBe(53_117n);
    expect(result.causesDeactivation).toBe(true);
  });

  it("returns the error when simulation reverts", async () => {
    const client = mockClient({ simulateThrows: new Error("execution reverted") });
    const result = await simulateRemoval(client, { profile: profile(), target: B, account: C });
    expect(result.ok).toBe(false);
  });
});

describe("confirmRemoval", () => {
  it("confirms the wallet is unbound", async () => {
    const result = await confirmRemoval(mockClient(), B);
    expect(result.unbound).toBe(true);
  });

  it("reports still-bound when the wallet remains attached", async () => {
    const client = mockClient({ bindings: { [B.toLowerCase()]: ONE_ADDR } });
    const result = await confirmRemoval(client, B);
    expect(result.unbound).toBe(false);
    expect(result.boundTo).toBe(ONE_ADDR);
  });
});
