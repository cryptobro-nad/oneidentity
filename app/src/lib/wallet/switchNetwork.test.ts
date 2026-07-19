import { describe, expect, it, vi } from "vitest";
import type { EIP1193Provider } from "viem";
import {
  ERROR_UNRECOGNIZED_CHAIN,
  ERROR_USER_REJECTED,
  extractRpcErrorCode,
  isUserRejection,
  switchToMonad,
} from "./provider";

const MONAD_HEX = "0x8f";
const rpcError = (code: number, message = "rpc error") => Object.assign(new Error(message), { code });

/**
 * Scripted provider. `chainSequence` is the value `eth_chainId` returns on each
 * successive call, so a switch that does or does not take effect can be modelled.
 */
function mockProvider(opts: {
  switchBehaviour?: (attempt: number) => void;
  addBehaviour?: () => void;
  chainSequence?: string[];
}) {
  let switchAttempts = 0;
  let chainReads = 0;
  const calls: string[] = [];

  const request = vi.fn(async ({ method }: { method: string }) => {
    calls.push(method);
    if (method === "wallet_switchEthereumChain") {
      switchAttempts++;
      opts.switchBehaviour?.(switchAttempts);
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      opts.addBehaviour?.();
      return null;
    }
    if (method === "eth_chainId") {
      const seq = opts.chainSequence ?? [MONAD_HEX];
      const value = seq[Math.min(chainReads, seq.length - 1)]!;
      chainReads++;
      return value;
    }
    throw new Error(`unexpected method ${method}`);
  });

  return { provider: { request } as unknown as EIP1193Provider, calls, request };
}

describe("extractRpcErrorCode", () => {
  it("reads a top-level code", () => {
    expect(extractRpcErrorCode(rpcError(4902))).toBe(4902);
  });

  it("reads a code nested under cause — the WalletConnect shape", () => {
    const wrapped = Object.assign(new Error("wrapped"), { cause: rpcError(4902) });
    expect(extractRpcErrorCode(wrapped)).toBe(4902);
  });

  it("reads a code nested under data.originalError", () => {
    const wrapped = Object.assign(new Error("wrapped"), {
      data: { originalError: { code: 4902 } },
    });
    expect(extractRpcErrorCode(wrapped)).toBe(4902);
  });

  it("reads a deeply nested code", () => {
    const wrapped = { cause: { error: { data: { code: 4001 } } } };
    expect(extractRpcErrorCode(wrapped)).toBe(4001);
  });

  it("reads a numeric-string code", () => {
    expect(extractRpcErrorCode({ code: "4902" })).toBe(4902);
  });

  it("falls back to the message when no structured code exists", () => {
    expect(extractRpcErrorCode(new Error("Unrecognized chain ID. code 4902"))).toBe(4902);
  });

  it("returns null when there is no code at all", () => {
    expect(extractRpcErrorCode(new Error("something else"))).toBeNull();
  });

  it("survives a circular error object", () => {
    const a: Record<string, unknown> = { message: "x" };
    a.cause = a;
    expect(() => extractRpcErrorCode(a)).not.toThrow();
  });
});

describe("isUserRejection", () => {
  it("detects code 4001", () => {
    expect(isUserRejection(rpcError(ERROR_USER_REJECTED))).toBe(true);
  });

  it("detects a nested 4001", () => {
    expect(isUserRejection({ cause: { code: 4001 } })).toBe(true);
  });

  it("detects rejection wording without a code", () => {
    expect(isUserRejection(new Error("User rejected the request"))).toBe(true);
  });

  it("does not treat an unrecognised chain as a rejection", () => {
    expect(isUserRejection(rpcError(ERROR_UNRECOGNIZED_CHAIN))).toBe(false);
  });
});

describe("switchToMonad — success", () => {
  it("succeeds on a direct switch and reports chain 143", async () => {
    const { provider, calls } = mockProvider({ chainSequence: [MONAD_HEX] });
    const outcome = await switchToMonad(provider);

    expect(outcome).toEqual({ ok: true, chainId: 143 });
    expect(calls).toContain("wallet_switchEthereumChain");
    expect(calls).not.toContain("wallet_addEthereumChain");
  });

  it("always verifies by re-reading eth_chainId", async () => {
    const { provider, calls } = mockProvider({ chainSequence: [MONAD_HEX] });
    await switchToMonad(provider);
    // A silently-ignored request must not be able to look like success.
    expect(calls.filter((c) => c === "eth_chainId").length).toBeGreaterThanOrEqual(1);
  });
});

describe("switchToMonad — unknown chain triggers add THEN switch", () => {
  it("adds Monad on a top-level 4902, then switches explicitly", async () => {
    const { provider, calls } = mockProvider({
      switchBehaviour: (attempt) => {
        if (attempt === 1) throw rpcError(ERROR_UNRECOGNIZED_CHAIN);
      },
      chainSequence: [MONAD_HEX],
    });

    const outcome = await switchToMonad(provider);

    expect(outcome.ok).toBe(true);
    expect(calls).toEqual([
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      // Adding does not switch in most wallets, so the explicit second switch
      // is required — omitting it was the original bug.
      "wallet_switchEthereumChain",
      "eth_chainId",
    ]);
  });

  it("adds Monad on a NESTED 4902 — the WalletConnect case", async () => {
    const { provider, calls } = mockProvider({
      switchBehaviour: (attempt) => {
        if (attempt === 1) {
          throw Object.assign(new Error("wc wrapped"), { cause: { code: 4902 } });
        }
      },
      chainSequence: [MONAD_HEX],
    });

    const outcome = await switchToMonad(provider);

    expect(outcome.ok).toBe(true);
    expect(calls).toContain("wallet_addEthereumChain");
  });

  it("reports unsupported-chain when adding fails", async () => {
    const { provider } = mockProvider({
      switchBehaviour: (attempt) => {
        if (attempt === 1) throw rpcError(ERROR_UNRECOGNIZED_CHAIN);
      },
      addBehaviour: () => {
        throw new Error("cannot add");
      },
      chainSequence: ["0x1"],
    });

    const outcome = await switchToMonad(provider);
    expect(outcome).toMatchObject({ ok: false, reason: "unsupported-chain" });
  });
});

describe("switchToMonad — failures", () => {
  it("does NOT add the chain after a user rejection", async () => {
    const { provider, calls } = mockProvider({
      switchBehaviour: () => {
        throw rpcError(ERROR_USER_REJECTED);
      },
      chainSequence: ["0x1"],
    });

    const outcome = await switchToMonad(provider);

    expect(outcome).toMatchObject({ ok: false, reason: "rejected" });
    // Re-prompting after "no" is the wrong response to that answer.
    expect(calls).not.toContain("wallet_addEthereumChain");
  });

  it("does not add the chain after a nested rejection", async () => {
    const { provider, calls } = mockProvider({
      switchBehaviour: () => {
        throw { cause: { code: 4001 } };
      },
      chainSequence: ["0x1"],
    });

    await switchToMonad(provider);
    expect(calls).not.toContain("wallet_addEthereumChain");
  });

  it("reports unsupported-method for 4200", async () => {
    const { provider } = mockProvider({
      switchBehaviour: () => {
        throw rpcError(4200);
      },
      chainSequence: ["0x1"],
    });

    const outcome = await switchToMonad(provider);
    expect(outcome).toMatchObject({ ok: false, reason: "unsupported-method" });
  });

  it("reports still-wrong-chain when the wallet silently ignores the request", async () => {
    // No error thrown, but the chain never changes — the exact mobile symptom.
    const { provider } = mockProvider({ chainSequence: ["0x1"] });
    const outcome = await switchToMonad(provider);

    expect(outcome).toMatchObject({ ok: false, reason: "still-wrong-chain", chainId: 1 });
  });

  it("reports the actual chain id on failure so the UI can show it", async () => {
    const { provider } = mockProvider({
      switchBehaviour: () => {
        throw rpcError(ERROR_USER_REJECTED);
      },
      chainSequence: ["0x1"],
    });

    const outcome = await switchToMonad(provider);
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.chainId).toBe(1);
  });

  it("gives every failure a non-empty, non-raw message", async () => {
    const { provider } = mockProvider({
      switchBehaviour: () => {
        throw rpcError(ERROR_USER_REJECTED);
      },
      chainSequence: ["0x1"],
    });

    const outcome = await switchToMonad(provider);
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.message.length).toBeGreaterThan(0);
    expect(outcome.message).not.toMatch(/\{|\[object/);
  });

  it("never throws — the caller always gets a structured outcome", async () => {
    const { provider } = mockProvider({
      switchBehaviour: () => {
        throw new Error("catastrophic");
      },
      chainSequence: ["0x1"],
    });

    await expect(switchToMonad(provider)).resolves.toMatchObject({ ok: false });
  });
});
