import { describe, expect, it, vi } from "vitest";

const { REG, ONE, PRIMARY, SECONDARY, OUTSIDER } = vi.hoisted(() => ({
  REG: "0x1111111111111111111111111111111111111111",
  ONE: "0x2222222222222222222222222222222222222222",
  PRIMARY: "0xB09684f5486d1af80699BbC27f14dd5A905da873",
  SECONDARY: "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1",
  OUTSIDER: "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946",
}));
const ZERO = "0x0000000000000000000000000000000000000000";

vi.mock("@/lib/v2link/registry", async (orig) => {
  const mod = (await orig()) as Record<string, unknown>;
  return { ...mod, ONE_REGISTRY_V2_ADDRESS: REG };
});

// Fake chain: ONE has primary + secondary; membersOf returns secondary FIRST to
// prove the action re-orders primary to the front.
vi.mock("@/lib/rpc", () => ({
  withRpcFallback: async (fn: (c: unknown) => Promise<unknown>) => {
    const client = {
      readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
        const a = String(args[0]).toLowerCase();
        switch (functionName) {
          case "exists":
            return a === ONE.toLowerCase();
          case "activeOneOf":
            return a === PRIMARY.toLowerCase() || a === SECONDARY.toLowerCase() ? ONE : ZERO;
          case "primaryOf":
            return PRIMARY;
          case "membersOf":
            return [SECONDARY, PRIMARY];
          case "memberCountOf":
            return 2n;
          case "isActive":
            return true;
          default:
            return ZERO;
        }
      },
    };
    return { value: await fn(client) };
  },
}));

import { loadV2ProfileAction, loadV2MembershipAction } from "./v2actions";

describe("loadV2ProfileAction", () => {
  it("resolves from a member wallet and lists the primary first", async () => {
    const res = await loadV2ProfileAction(SECONDARY);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.profile.address.toLowerCase()).toBe(ONE.toLowerCase());
    expect(res.profile.primary.toLowerCase()).toBe(PRIMARY.toLowerCase());
    expect(res.profile.members[0]!.toLowerCase()).toBe(PRIMARY.toLowerCase());
    expect(res.profile.memberCount).toBe(2);
    expect(res.profile.isActive).toBe(true);
  });

  it("resolves directly from the identity address", async () => {
    const res = await loadV2ProfileAction(ONE);
    expect(res.ok).toBe(true);
  });

  it("reports an unrelated address as not a ONE", async () => {
    const res = await loadV2ProfileAction(OUTSIDER);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not-a-one");
  });

  it("rejects a malformed address", async () => {
    const res = await loadV2ProfileAction("not-an-address");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid");
  });
});

describe("loadV2MembershipAction", () => {
  it("returns the primary role for the primary wallet", async () => {
    const res = await loadV2MembershipAction(PRIMARY);
    expect(res.state).toBe("linked");
    if (res.state === "linked") expect(res.role).toBe("primary");
  });

  it("returns the secondary role for a linked secondary", async () => {
    const res = await loadV2MembershipAction(SECONDARY);
    expect(res.state).toBe("linked");
    if (res.state === "linked") expect(res.role).toBe("secondary");
  });

  it("returns unlinked for an unrelated wallet", async () => {
    const res = await loadV2MembershipAction(OUTSIDER);
    expect(res.state).toBe("unlinked");
  });
});
