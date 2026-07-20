// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Models the mobile failure mode the intent guard exists for: a wallet that
 * does NOT tear its own session down on disconnect (backgrounded app, dead
 * relay socket), so the persisted session survives into the next page load.
 */
const state: {
  persisted: { session: unknown; accounts: string[]; chainId: number } | null;
  disconnectCalls: number;
  clearOnDisconnect: boolean;
} = { persisted: null, disconnectCalls: 0, clearOnDisconnect: true };

vi.mock("@walletconnect/ethereum-provider", () => ({
  EthereumProvider: {
    init: vi.fn(async () => ({
      session: state.persisted?.session,
      accounts: state.persisted?.accounts ?? [],
      chainId: state.persisted?.chainId ?? 0,
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {
        state.disconnectCalls++;
        if (state.clearOnDisconnect) state.persisted = null;
      }),
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_accounts") return state.persisted?.accounts ?? [];
        if (method === "eth_chainId") return `0x${(state.persisted?.chainId ?? 0).toString(16)}`;
        throw new Error(`unexpected ${method}`);
      }),
    })),
  },
}));

const ADDRESS = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B";

async function loadModule() {
  const mod = await import("./walletconnect");
  mod.resetWalletConnectCache();
  return mod;
}

beforeEach(() => {
  vi.resetModules();
  state.persisted = null;
  state.disconnectCalls = 0;
  state.clearOnDisconnect = true;
  window.localStorage.clear();
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = "test-project-id";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  vi.clearAllMocks();
});

describe("deliberate-disconnect intent guard", () => {
  it("does not restore after the user disconnected, even if the wallet kept the session", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    state.clearOnDisconnect = false; // mobile: the wallet's teardown silently failed
    const mod = await loadModule();

    mod.markWalletConnectDisconnected();
    const restored = await mod.restoreWalletConnectSession();

    expect(restored).toBeNull();
    // It also actively cleared the lingering session rather than leaving it.
    expect(state.disconnectCalls).toBeGreaterThanOrEqual(1);
  });

  it("restores normally once the disconnect intent is cleared (user reconnects)", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    const mod = await loadModule();

    mod.markWalletConnectDisconnected();
    mod.clearWalletConnectDisconnectIntent();

    const restored = await mod.restoreWalletConnectSession();
    expect(restored).not.toBeNull();
    expect(restored!.accounts[0]).toBe(ADDRESS);
  });

  it("tracks the flag across set/clear", async () => {
    const mod = await loadModule();
    expect(mod.wasWalletConnectDisconnectedByUser()).toBe(false);
    mod.markWalletConnectDisconnected();
    expect(mod.wasWalletConnectDisconnectedByUser()).toBe(true);
    mod.clearWalletConnectDisconnectIntent();
    expect(mod.wasWalletConnectDisconnectedByUser()).toBe(false);
  });

  it("still restores a live session when no disconnect was intended", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    const mod = await loadModule();

    // No mark* call: a normal returning user.
    const restored = await mod.restoreWalletConnectSession();
    expect(restored).not.toBeNull();
    expect(state.disconnectCalls).toBe(0);
  });
});
