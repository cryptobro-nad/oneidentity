import { describe, expect, it } from "vitest";
import { encodeAbiParameters, hashTypedData, keccak256, toHex } from "viem";
import {
  buildJoinOneTypedData,
  deadlineFromNow,
  generateSalt,
  isExpired,
  JOIN_ONE_TYPEHASH,
  JOIN_ONE_TYPE_STRING,
  ONE_DOMAIN,
} from "./eip712";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

describe("EIP-712 domain matches the deployed registry", () => {
  it("uses the exact deployed domain values", () => {
    // Read live from eip712Domain() on 0xf8E6…F915.
    expect(ONE_DOMAIN.name).toBe("ONE");
    expect(ONE_DOMAIN.version).toBe("1");
    expect(ONE_DOMAIN.chainId).toBe(143);
    expect(ONE_DOMAIN.verifyingContract).toBe("0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915");
  });

  it("points at the deployed registry address", () => {
    expect(ONE_DOMAIN.verifyingContract).toBe(ONE_REGISTRY_ADDRESS);
  });

  it("derives the exact domain separator held on-chain", () => {
    // Recomputes keccak256(abi.encode(EIP712Domain typehash, ...)) the same way
    // OpenZeppelin's EIP712 does, and compares against the value read from the
    // deployed contract's _cachedDomainSeparator immutable slot.
    const separator = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "address" },
        ],
        [
          keccak256(
            toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
          ),
          keccak256(toHex("ONE")),
          keccak256(toHex("1")),
          143n,
          ONE_REGISTRY_ADDRESS,
        ],
      ),
    );
    expect(separator).toBe(
      "0x960c5a75782e99137e7ed08ee5f3b96ce7f2a37516829ba3541f78e21141e184",
    );
  });
});

describe("JoinOne typehash", () => {
  it("matches JOIN_ONE_TYPEHASH() on the deployed contract", () => {
    // Live value from 0xf8E6…F915.
    expect(JOIN_ONE_TYPEHASH).toBe(
      "0xb374db42013b92adfb78ac6714742925733494dfad7bb318eed19df9edeee2ba",
    );
  });

  it("encodes the exact field order from the Solidity struct", () => {
    expect(JOIN_ONE_TYPE_STRING).toBe(
      "JoinOne(address wallet,address primaryWallet,bytes32 membersHash,bytes32 salt,uint256 nonce,uint256 deadline)",
    );
  });
});

describe("typed data construction", () => {
  const message = {
    wallet: B,
    primaryWallet: A,
    membersHash: "0x92540e543d2874c97c0d15d2a406e23fb4675e686138d10560305eebfa330ff3" as const,
    salt: "0x0000000000000000000000000000000000000000000000000000000000000001" as const,
    nonce: 0n,
    deadline: 1800000000n,
  };

  it("builds well-formed typed data", () => {
    const typed = buildJoinOneTypedData(message);
    expect(typed.primaryType).toBe("JoinOne");
    expect(typed.domain).toEqual(ONE_DOMAIN);
    expect(typed.message).toEqual(message);
  });

  it("is hashable by viem without error", () => {
    const typed = buildJoinOneTypedData(message);
    expect(() => hashTypedData(typed)).not.toThrow();
  });

  it("produces a different digest when ANY signed field changes", () => {
    const base = hashTypedData(buildJoinOneTypedData(message));

    const variants = [
      { ...message, wallet: A },
      { ...message, primaryWallet: B },
      { ...message, membersHash: ("0x" + "11".repeat(32)) as `0x${string}` },
      { ...message, salt: ("0x" + "22".repeat(32)) as `0x${string}` },
      { ...message, nonce: 1n },
      { ...message, deadline: 1800000001n },
    ];

    for (const variant of variants) {
      expect(hashTypedData(buildJoinOneTypedData(variant))).not.toBe(base);
    }
  });

  it("produces a different digest for a different verifying contract", () => {
    const base = hashTypedData(buildJoinOneTypedData(message));
    const foreign = hashTypedData({
      ...buildJoinOneTypedData(message),
      domain: { ...ONE_DOMAIN, verifyingContract: A },
    });
    expect(foreign).not.toBe(base);
  });

  it("produces a different digest for a different chain id", () => {
    const base = hashTypedData(buildJoinOneTypedData(message));
    const otherChain = hashTypedData({
      ...buildJoinOneTypedData(message),
      domain: { ...ONE_DOMAIN, chainId: 10143 },
    });
    expect(otherChain).not.toBe(base);
  });
});

describe("salt generation", () => {
  it("returns a 32-byte hex value", () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is not derived from a timestamp — successive salts differ", () => {
    const salts = new Set(Array.from({ length: 50 }, () => generateSalt()));
    expect(salts.size).toBe(50);
  });
});

describe("deadlines", () => {
  it("defaults to a bounded window in the future", () => {
    const now = Math.floor(Date.now() / 1000);
    const deadline = deadlineFromNow(45);
    expect(Number(deadline)).toBeGreaterThan(now);
    expect(Number(deadline)).toBeLessThanOrEqual(now + 45 * 60 + 2);
  });

  it("treats a past deadline as expired", () => {
    expect(isExpired(1000n, 1001)).toBe(true);
  });

  it("treats an equal deadline as still valid, matching the contract", () => {
    // ONERegistry: `if (block.timestamp > auth.deadline) revert` — equal passes.
    expect(isExpired(1000n, 1000)).toBe(false);
  });

  it("treats a future deadline as valid", () => {
    expect(isExpired(2000n, 1000)).toBe(false);
  });
});
