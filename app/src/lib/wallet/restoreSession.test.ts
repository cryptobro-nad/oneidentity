import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fake EthereumProvider, mirroring the public surface of the installed
 * @walletconnect/ethereum-provider@2.23.10: `session`, `accounts`, `chainId`,
 * `connect()`, `disconnect()` and `request()`.
 *
 * `init()` is what rehydrates a persisted session in the real SDK, so the mock
 * models exactly that: whatever `persisted` holds is what init() surfaces.
 */
const state: {
  persisted: { session: unknown; accounts: string[]; chainId: number } | null;
  initCalls: number;
  connectCalls: number;
  disconnectCalls: number;
  requestFails: Set<string>;
} = {
  persisted: null,
  initCalls: 0,
  connectCalls: 0,
  disconnectCalls: 0,
  requestFails: new Set(),
};

vi.mock("@walletconnect/ethereum-provider", () => ({
  EthereumProvider: {
    init: vi.fn(async () => {
      state.initCalls++;
      const p = state.persisted;
      return {
        // Populated by init() from storage in the real SDK.
        session: p?.session,
        accounts: p?.accounts ?? [],
        chainId: p?.chainId ?? 0,
        connect: vi.fn(async () => {
          state.connectCalls++;
        }),
        disconnect: vi.fn(async () => {
          state.disconnectCalls++;
          state.persisted = null;
        }),
        request: vi.fn(async ({ method }: { method: string }) => {
          if (state.requestFails.has(method)) throw new Error(`${method} failed`);
          if (method === "eth_accounts") return state.persisted?.accounts ?? [];
          if (method === "eth_chainId") {
            return `0x${(state.persisted?.chainId ?? 0).toString(16)}`;
          }
          throw new Error(`unexpected ${method}`);
        }),
      };
    }),
  },
}));

const ADDRESS = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B";
const OTHER = "0xe3A0795381521C177fc8c7723213df7B56A10a31";

async function loadModule() {
  const mod = await import("./walletconnect");
  mod.resetWalletConnectCache();
  return mod;
}

beforeEach(() => {
  vi.resetModules();
  state.persisted = null;
  state.initCalls = 0;
  state.connectCalls = 0;
  state.disconnectCalls = 0;
  state.requestFails = new Set();
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = "test-project-id";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  vi.clearAllMocks();
});

describe("restoring an existing session", () => {
  it("restores a session that survived a reload", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    const { restoreWalletConnectSession } = await loadModule();

    const restored = await restoreWalletConnectSession();

    expect(restored).not.toBeNull();
    expect(restored!.accounts[0]).toBe(ADDRESS);
    expect(restored!.chainId).toBe(143);
    expect(restored!.wallet.info.uuid).toBe("walletconnect");
  });

  it("never calls connect() during restoration", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    const { restoreWalletConnectSession } = await loadModule();

    await restoreWalletConnectSession();

    // connect() would open a QR modal or prompt the wallet. Restoration must
    // be completely silent.
    expect(state.connectCalls).toBe(0);
    expect(state.initCalls).toBe(1);
  });

  it("takes the address from the provider, not from app storage", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [OTHER], chainId: 143 };
    const { restoreWalletConnectSession } = await loadModule();

    const restored = await restoreWalletConnectSession();
    expect(restored!.accounts[0]).toBe(OTHER);
  });

  it("takes the chain id from the provider", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 8453 };
    const { restoreWalletConnectSession } = await loadModule();

    const restored = await restoreWalletConnectSession();
    expect(restored!.chainId).toBe(8453);
  });

  it("restores a WRONG-NETWORK session as connected", async () => {
    // A wrong network is a connected wallet that needs switching, not a
    // failed restoration.
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 1 };
    const { restoreWalletConnectSession } = await loadModule();

    const restored = await restoreWalletConnectSession();

    expect(restored).not.toBeNull();
    expect(restored!.chainId).toBe(1);
    expect(restored!.accounts[0]).toBe(ADDRESS);
  });

  it("falls back to the accounts property when eth_accounts fails", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    state.requestFails.add("eth_accounts");
    const { restoreWalletConnectSession } = await loadModule();

    const restored = await restoreWalletConnectSession();
    expect(restored!.accounts[0]).toBe(ADDRESS);
  });

  it("falls back to the chainId property when eth_chainId fails", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    state.requestFails.add("eth_chainId");
    const { restoreWalletConnectSession } = await loadModule();

    const restored = await restoreWalletConnectSession();
    expect(restored!.chainId).toBe(143);
  });
});

describe("no session to restore", () => {
  it("returns null when nothing is persisted", async () => {
    state.persisted = null;
    const { restoreWalletConnectSession } = await loadModule();

    expect(await restoreWalletConnectSession()).toBeNull();
    expect(state.connectCalls).toBe(0);
  });

  it("returns null without initialising when unconfigured", async () => {
    delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
    const { restoreWalletConnectSession } = await loadModule();

    expect(await restoreWalletConnectSession()).toBeNull();
    expect(state.initCalls).toBe(0);
  });

  it("clears a session that has no accounts instead of showing it connected", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [], chainId: 143 };
    const { restoreWalletConnectSession } = await loadModule();

    const restored = await restoreWalletConnectSession();

    expect(restored).toBeNull();
    // The stale session is torn down so the user gets a clean connect prompt.
    expect(state.disconnectCalls).toBe(1);
  });

  it("returns null rather than throwing when init fails", async () => {
    const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
    (EthereumProvider.init as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("relay unreachable"),
    );
    const { restoreWalletConnectSession } = await loadModule();

    await expect(restoreWalletConnectSession()).resolves.toBeNull();
  });
});

describe("deliberate disconnect", () => {
  it("ends the real session, not just local state", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    const { restoreWalletConnectSession, disconnectWalletConnect } = await loadModule();

    await restoreWalletConnectSession();
    await disconnectWalletConnect();

    expect(state.disconnectCalls).toBe(1);
  });

  it("prevents restoration after a refresh", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    const first = await loadModule();

    expect(await first.restoreWalletConnectSession()).not.toBeNull();
    await first.disconnectWalletConnect();

    // Simulate a reload: fresh module, fresh cache. The provider's own
    // disconnect removed the persisted session, so nothing comes back — no
    // custom "remember me" flag required, or trusted.
    vi.resetModules();
    const second = await loadModule();
    expect(await second.restoreWalletConnectSession()).toBeNull();
  });

  it("is safe to call with no active session", async () => {
    const { disconnectWalletConnect } = await loadModule();
    await expect(disconnectWalletConnect()).resolves.toBeUndefined();
  });

  it("clears the cached provider so the next connect starts fresh", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    const { restoreWalletConnectSession, disconnectWalletConnect, hasWalletConnectSession } =
      await loadModule();

    await restoreWalletConnectSession();
    expect(hasWalletConnectSession()).toBe(true);

    await disconnectWalletConnect();
    expect(hasWalletConnectSession()).toBe(false);
  });
});

describe("no live connections in tests", () => {
  it("uses a mocked SDK throughout", async () => {
    state.persisted = { session: { topic: "abc" }, accounts: [ADDRESS], chainId: 143 };
    const { restoreWalletConnectSession } = await loadModule();
    await restoreWalletConnectSession();

    // Everything went through the mock: no relay socket, no RPC, no wallet.
    expect(state.initCalls).toBeGreaterThan(0);
    expect(state.connectCalls).toBe(0);
  });
});
