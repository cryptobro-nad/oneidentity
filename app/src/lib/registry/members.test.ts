import { describe, expect, it } from "vitest";
import {
  computeMembersHash,
  isStrictlySorted,
  MAX_MEMBERS,
  MIN_MEMBERS,
  secondariesInOrder,
  sortMembers,
  validateMemberAddress,
  validateMemberSet,
  ZERO_ADDRESS,
} from "./members";
import type { PortfolioAddress } from "@/lib/types";

// Real Monad Mainnet addresses discovered on-chain during the data spike.
const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;
const C = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946" as PortfolioAddress;
const D = "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799" as PortfolioAddress;
const E = "0xd651346d7c789536ebf06dc72aE3C8502cd695CC" as PortfolioAddress;
const F = "0xb2A44ce122FAB07Fc514ea7830623201b152D99D" as PortfolioAddress;

describe("constants match the deployed contract", () => {
  it("MIN_MEMBERS and MAX_MEMBERS", () => {
    // Read live from 0xf8E6…F915: MIN_MEMBERS()=2, MAX_MEMBERS()=5.
    expect(MIN_MEMBERS).toBe(2);
    expect(MAX_MEMBERS).toBe(5);
  });
});

describe("sortMembers", () => {
  it("sorts numerically, not lexicographically on the checksummed string", () => {
    // B starts 0x2b, A starts 0xB0. A naive string sort on CHECKSUMMED values
    // puts uppercase 'B' (0x42) before lowercase 'b' (0x62) and would order
    // these wrongly, producing UnsortedMembers on-chain.
    const sorted = sortMembers([A, B]);
    expect(sorted).toEqual([B, A]);
  });

  it("produces strictly ascending output for five wallets", () => {
    const sorted = sortMembers([A, B, C, D, E]);
    expect(isStrictlySorted(sorted)).toBe(true);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.toLowerCase() > sorted[i - 1]!.toLowerCase()).toBe(true);
    }
  });

  it("is stable regardless of input order", () => {
    expect(sortMembers([A, B, C])).toEqual(sortMembers([C, A, B]));
    expect(sortMembers([E, D, C, B, A])).toEqual(sortMembers([A, B, C, D, E]));
  });

  it("does not mutate its input", () => {
    const input = [A, B, C];
    const copy = [...input];
    sortMembers(input);
    expect(input).toEqual(copy);
  });

  it("handles case-varied input identically", () => {
    expect(sortMembers([A.toLowerCase() as PortfolioAddress, B])).toEqual(
      sortMembers([A, B]),
    );
  });
});

describe("computeMembersHash", () => {
  it("matches the value the deployed contract returns", () => {
    // Live: membersHashOf([0x..01, 0x..02]) on 0xf8E6…F915 returned
    // 0x92540e543d2874c97c0d15d2a406e23fb4675e686138d10560305eebfa330ff3
    const one = "0x0000000000000000000000000000000000000001" as PortfolioAddress;
    const two = "0x0000000000000000000000000000000000000002" as PortfolioAddress;
    expect(computeMembersHash([one, two])).toBe(
      "0x92540e543d2874c97c0d15d2a406e23fb4675e686138d10560305eebfa330ff3",
    );
  });

  it("is order-sensitive, so an unsorted list hashes differently", () => {
    expect(computeMembersHash([A, B])).not.toBe(computeMembersHash([B, A]));
  });

  it("differs for different member sets", () => {
    expect(computeMembersHash(sortMembers([A, B]))).not.toBe(
      computeMembersHash(sortMembers([A, C])),
    );
  });

  it("is case-insensitive on input (addresses are checksummed by viem)", () => {
    expect(computeMembersHash([A])).toBe(
      computeMembersHash([A.toLowerCase() as PortfolioAddress]),
    );
  });
});

describe("validateMemberAddress", () => {
  it("accepts a valid address", () => {
    expect(validateMemberAddress(A, []).ok).toBe(true);
  });

  it("rejects empty and malformed input", () => {
    expect(validateMemberAddress("  ", [])).toMatchObject({ reason: "empty" });
    expect(validateMemberAddress("nope", [])).toMatchObject({ reason: "invalid" });
  });

  it("rejects the zero address", () => {
    expect(validateMemberAddress(ZERO_ADDRESS, [])).toMatchObject({
      reason: "zero-address",
    });
  });

  it("rejects duplicates regardless of case", () => {
    expect(validateMemberAddress(A.toLowerCase(), [A])).toMatchObject({
      reason: "duplicate",
    });
  });

  it("rejects a sixth wallet", () => {
    expect(validateMemberAddress(F, [A, B, C, D, E])).toMatchObject({
      reason: "max-reached",
    });
  });

  it("reports duplicate before max-reached", () => {
    expect(validateMemberAddress(A, [A, B, C, D, E])).toMatchObject({
      reason: "duplicate",
    });
  });
});

describe("validateMemberSet", () => {
  it("accepts a valid two-wallet set", () => {
    const sorted = sortMembers([A, B]);
    expect(validateMemberSet(sorted, sorted[0]!)).toEqual([]);
  });

  it("accepts a valid five-wallet set", () => {
    const sorted = sortMembers([A, B, C, D, E]);
    expect(validateMemberSet(sorted, sorted[2]!)).toEqual([]);
  });

  it("rejects one wallet", () => {
    expect(validateMemberSet([A], A)).toContainEqual({ kind: "too-few", count: 1 });
  });

  it("rejects six wallets", () => {
    const six = sortMembers([A, B, C, D, E, F]);
    expect(validateMemberSet(six, six[0]!)).toContainEqual({ kind: "too-many", count: 6 });
  });

  it("rejects the zero address", () => {
    const withZero = sortMembers([ZERO_ADDRESS as PortfolioAddress, A]);
    expect(validateMemberSet(withZero, A)).toContainEqual({
      kind: "zero-address",
      index: 0,
    });
  });

  it("rejects duplicates", () => {
    expect(validateMemberSet([A, A], A)).toContainEqual({ kind: "duplicate", address: A });
  });

  it("rejects an unsorted list", () => {
    const descending = sortMembers([A, B, C]).reverse();
    expect(validateMemberSet(descending, descending[0]!)).toContainEqual({ kind: "unsorted" });
  });

  it("rejects a primary that is not a member", () => {
    const sorted = sortMembers([A, B]);
    expect(validateMemberSet(sorted, F)).toContainEqual({
      kind: "primary-not-member",
      primary: F,
    });
  });
});

describe("secondariesInOrder", () => {
  it("returns sorted members minus the primary, preserving sorted order", () => {
    const sorted = sortMembers([A, B, C]);
    const primary = sorted[1]!;
    expect(secondariesInOrder(sorted, primary)).toEqual([sorted[0]!, sorted[2]!]);
  });

  it("returns one secondary for a two-wallet ONE", () => {
    const sorted = sortMembers([A, B]);
    expect(secondariesInOrder(sorted, sorted[0]!)).toEqual([sorted[1]!]);
  });

  it("returns four secondaries for a five-wallet ONE", () => {
    const sorted = sortMembers([A, B, C, D, E]);
    expect(secondariesInOrder(sorted, sorted[0]!)).toHaveLength(4);
  });

  it("is case-insensitive on the primary", () => {
    const sorted = sortMembers([A, B]);
    const lower = sorted[0]!.toLowerCase() as PortfolioAddress;
    expect(secondariesInOrder(sorted, lower)).toEqual([sorted[1]!]);
  });
});
