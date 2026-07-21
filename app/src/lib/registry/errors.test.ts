import { describe, expect, it } from "vitest";
import { encodeErrorResult } from "viem";
import { ONE_REGISTRY_ABI } from "./abi";
import { decodeRegistryError } from "./errors";
import type { PortfolioAddress } from "@/lib/types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const ONE_ADDR = "0xCC271e02D2a734F853768b78E9B9f813D8f7A869" as PortfolioAddress;

/** Wraps encoded revert data the way a provider surfaces it. */
function revertWith(errorName: string, args: readonly unknown[]) {
  const data = encodeErrorResult({
    abi: ONE_REGISTRY_ABI,
    errorName: errorName as never,
    args: args as never,
  });
  const error = new Error(`execution reverted`) as Error & { data?: string };
  error.data = data;
  return error;
}

describe("custom error decoding", () => {
  it("decodes InvalidMemberCount", () => {
    const decoded = decodeRegistryError(revertWith("InvalidMemberCount", [1n]));
    expect(decoded.name).toBe("InvalidMemberCount");
    expect(decoded.title).toMatch(/number of wallets/i);
    expect(decoded.detail).toContain("1");
  });

  it("decodes ZeroAddressMember", () => {
    const decoded = decodeRegistryError(revertWith("ZeroAddressMember", [0n]));
    expect(decoded.name).toBe("ZeroAddressMember");
    expect(decoded.title).toMatch(/zero address/i);
  });

  it("decodes DuplicateMember and names the wallet", () => {
    const decoded = decodeRegistryError(revertWith("DuplicateMember", [A, 1n]));
    expect(decoded.name).toBe("DuplicateMember");
    expect(decoded.detail).toContain(A);
  });

  it("decodes UnsortedMembers and blames the app, not the user", () => {
    const decoded = decodeRegistryError(revertWith("UnsortedMembers", [1n]));
    expect(decoded.name).toBe("UnsortedMembers");
    expect(decoded.action).toMatch(/bug in ONE/i);
  });

  it("decodes WalletAlreadyInActiveOne with both addresses", () => {
    const decoded = decodeRegistryError(revertWith("WalletAlreadyInActiveOne", [A, ONE_ADDR]));
    expect(decoded.name).toBe("WalletAlreadyInActiveOne");
    expect(decoded.detail).toContain(A);
    expect(decoded.detail).toContain(ONE_ADDR);
    expect(decoded.action).toBeDefined();
  });

  it("decodes SignatureExpired with a readable time", () => {
    const decoded = decodeRegistryError(revertWith("SignatureExpired", [A, 1800000000n]));
    expect(decoded.name).toBe("SignatureExpired");
    expect(decoded.detail).toMatch(/UTC/);
  });

  it("decodes InvalidSignature and explains the likely cause", () => {
    const decoded = decodeRegistryError(revertWith("InvalidSignature", [A, ONE_ADDR]));
    expect(decoded.name).toBe("InvalidSignature");
    expect(decoded.detail).toMatch(/nonce changed|configuration/i);
  });

  it("decodes CreationSaltAlreadyUsed", () => {
    const salt = ("0x" + "11".repeat(32)) as `0x${string}`;
    const decoded = decodeRegistryError(revertWith("CreationSaltAlreadyUsed", [salt]));
    expect(decoded.name).toBe("CreationSaltAlreadyUsed");
    expect(decoded.action).toMatch(/new draft/i);
  });

  it("decodes PrimaryNotInMemberList", () => {
    const decoded = decodeRegistryError(revertWith("PrimaryNotInMemberList", [A]));
    expect(decoded.name).toBe("PrimaryNotInMemberList");
  });

  it("decodes AuthCountMismatch", () => {
    const decoded = decodeRegistryError(revertWith("AuthCountMismatch", [2n, 1n]));
    expect(decoded.name).toBe("AuthCountMismatch");
    expect(decoded.detail).toContain("2");
  });

  it("decodes CannotRemovePrimary", () => {
    const decoded = decodeRegistryError(revertWith("CannotRemovePrimary", [A]));
    expect(decoded.name).toBe("CannotRemovePrimary");
  });

  it("decodes NotAuthorizedToRemove", () => {
    const decoded = decodeRegistryError(revertWith("NotAuthorizedToRemove", [A]));
    expect(decoded.name).toBe("NotAuthorizedToRemove");
  });

  it("decodes OneNotActive", () => {
    const decoded = decodeRegistryError(revertWith("OneNotActive", [ONE_ADDR]));
    expect(decoded.name).toBe("OneNotActive");
  });

  it("decodes UnknownOne", () => {
    const decoded = decodeRegistryError(revertWith("UnknownOne", [ONE_ADDR]));
    expect(decoded.name).toBe("UnknownOne");
  });

  it("decodes NotAMember", () => {
    const decoded = decodeRegistryError(revertWith("NotAMember", [ONE_ADDR, A]));
    expect(decoded.name).toBe("NotAMember");
  });
});

describe("non-contract failures", () => {
  it("recognises a user rejection by message", () => {
    const decoded = decodeRegistryError(new Error("User rejected the request"));
    expect(decoded.name).toBe("UserRejected");
    expect(decoded.detail).toMatch(/nothing was sent/i);
  });

  it("recognises a user rejection by EIP-1193 code 4001", () => {
    const error = Object.assign(new Error("denied"), { code: 4001 });
    expect(decodeRegistryError(error).name).toBe("UserRejected");
  });

  it("recognises insufficient funds and mentions Monad's gas model", () => {
    const decoded = decodeRegistryError(new Error("insufficient funds for gas * price + value"));
    expect(decoded.name).toBe("InsufficientFunds");
    expect(decoded.detail).toMatch(/full gas limit/i);
  });

  it("recognises a chain mismatch", () => {
    const decoded = decodeRegistryError(new Error("The current chain does not match the target chain"));
    expect(decoded.name).toBe("WrongChain");
  });
});

describe("presentation guarantees", () => {
  it("never returns a bare hex string as the explanation", () => {
    const decoded = decodeRegistryError(revertWith("InvalidMemberCount", [1n]));
    expect(decoded.detail).not.toMatch(/^0x[0-9a-f]+$/i);
    expect(decoded.title.length).toBeGreaterThan(0);
  });

  it("always preserves technical detail for the expandable section", () => {
    const decoded = decodeRegistryError(revertWith("InvalidMemberCount", [1n]));
    expect(decoded.technical.length).toBeGreaterThan(0);
  });

  it("degrades gracefully for an unrecognised error", () => {
    const decoded = decodeRegistryError(new Error("something odd happened"));
    expect(decoded.name).toBe("UnknownError");
    expect(decoded.title).toBeTruthy();
    expect(decoded.technical).toContain("something odd");
  });

  it("handles a non-Error value", () => {
    const decoded = decodeRegistryError("plain string failure");
    expect(decoded.name).toBe("UnknownError");
    expect(decoded.technical).toContain("plain string failure");
  });
});
