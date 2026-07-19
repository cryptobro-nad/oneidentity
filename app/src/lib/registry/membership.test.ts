import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { loadWalletMembership } from "./membership";
import { ZERO_ADDRESS } from "./lookup";
import type { PortfolioAddress } from "@/lib/types";

const ONE_ADDR = "0x1139dec3A681C96807D8C277601655A707494AaA" as PortfolioAddress;
const PRIMARY = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;
const SECONDARY = "0xe3A0795381521C177fc8c7723213df7B56A10a31" as PortfolioAddress;
const STRANGER = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;

function mockClient(opts: {
  activeOneOf?: Record<string, string>;
  primaryOf?: string;
  isActive?: boolean;
  memberCount?: bigint;
  throwOn?: string;
} = {}) {
  const readContract = vi.fn(
    async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      if (opts.throwOn === functionName) throw new Error("rpc down");
      switch (functionName) {
        case "activeOneOf":
          return opts.activeOneOf?.[(args?.[0] as string).toLowerCase()] ?? ZERO_ADDRESS;
        case "primaryOf":
          return opts.primaryOf ?? PRIMARY;
        case "isActive":
          return opts.isActive ?? true;
        case "memberCountOf":
          return opts.memberCount ?? 2n;
        default:
          throw new Error(`unexpected read: ${functionName}`);
      }
    },
  );
  return { readContract } as unknown as PublicClient & { readContract: typeof readContract };
}

const linkedTo = (one: string, ...wallets: string[]) =>
  Object.fromEntries(wallets.map((w) => [w.toLowerCase(), one]));

describe("loadWalletMembership", () => {
  it("reports a connected PRIMARY wallet with its active ONE", async () => {
    const client = mockClient({ activeOneOf: linkedTo(ONE_ADDR, PRIMARY), primaryOf: PRIMARY });
    const result = await loadWalletMembership(client, PRIMARY);

    expect(result).toMatchObject({
      state: "linked",
      oneAddress: ONE_ADDR,
      role: "primary",
      isActive: true,
      memberCount: 2,
    });
  });

  it("reports a connected SECONDARY wallet with the SAME active ONE", async () => {
    const client = mockClient({ activeOneOf: linkedTo(ONE_ADDR, SECONDARY), primaryOf: PRIMARY });
    const result = await loadWalletMembership(client, SECONDARY);

    expect(result).toMatchObject({
      state: "linked",
      oneAddress: ONE_ADDR,
      role: "secondary",
    });
  });

  it("derives the role from primaryOf, not from list position", async () => {
    // Same ONE, same member list; only primaryOf decides the role.
    const asPrimary = await loadWalletMembership(
      mockClient({ activeOneOf: linkedTo(ONE_ADDR, PRIMARY), primaryOf: PRIMARY }),
      PRIMARY,
    );
    const asSecondary = await loadWalletMembership(
      mockClient({ activeOneOf: linkedTo(ONE_ADDR, PRIMARY), primaryOf: SECONDARY }),
      PRIMARY,
    );

    expect(asPrimary).toMatchObject({ role: "primary" });
    expect(asSecondary).toMatchObject({ role: "secondary" });
  });

  it("is case-insensitive when comparing the primary", async () => {
    const client = mockClient({
      activeOneOf: linkedTo(ONE_ADDR, PRIMARY),
      primaryOf: PRIMARY.toLowerCase(),
    });
    const result = await loadWalletMembership(client, PRIMARY);
    expect(result).toMatchObject({ role: "primary" });
  });

  it("returns unlinked for a wallet with no active ONE", async () => {
    const result = await loadWalletMembership(mockClient(), STRANGER);
    expect(result).toEqual({ state: "unlinked" });
  });

  it("does not read identity details for an unlinked wallet", async () => {
    const client = mockClient();
    await loadWalletMembership(client, STRANGER);
    // Only activeOneOf should have been called.
    expect(client.readContract).toHaveBeenCalledTimes(1);
  });

  it("reports an INACTIVE linked ONE as linked but inactive", async () => {
    const client = mockClient({
      activeOneOf: linkedTo(ONE_ADDR, PRIMARY),
      isActive: false,
      memberCount: 1n,
    });
    const result = await loadWalletMembership(client, PRIMARY);
    expect(result).toMatchObject({ state: "linked", isActive: false, memberCount: 1 });
  });
});

describe("loadWalletMembership — failures are never 'unlinked'", () => {
  it("returns error, not unlinked, when activeOneOf throws", async () => {
    const result = await loadWalletMembership(mockClient({ throwOn: "activeOneOf" }), PRIMARY);
    expect(result.state).toBe("error");
    // The dangerous bug would be silently treating an RPC failure as "free to
    // create a ONE" — that would let a user start a transaction that reverts.
    expect(result.state).not.toBe("unlinked");
  });

  it("returns error when the identity details cannot be read", async () => {
    const client = mockClient({
      activeOneOf: linkedTo(ONE_ADDR, PRIMARY),
      throwOn: "primaryOf",
    });
    const result = await loadWalletMembership(client, PRIMARY);
    expect(result.state).toBe("error");
  });

  it("returns error for a malformed activeOneOf response", async () => {
    const client = mockClient({ activeOneOf: { [PRIMARY.toLowerCase()]: "garbage" } });
    const result = await loadWalletMembership(client, PRIMARY);
    expect(result.state).toBe("error");
  });

  it("rejects an invalid connected address without calling the Registry", async () => {
    const client = mockClient();
    const result = await loadWalletMembership(client, "not-an-address");
    expect(result.state).toBe("error");
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("always carries a non-empty message on error", async () => {
    const result = await loadWalletMembership(mockClient({ throwOn: "activeOneOf" }), PRIMARY);
    if (result.state !== "error") throw new Error("expected error");
    expect(result.message.length).toBeGreaterThan(0);
  });
});
