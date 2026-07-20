// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWallet } from "./useWallet";
import type { DiscoveredWallet } from "./provider";
import {
  getSnapshot as getDraft,
  resetDraftStoreCache,
  setDraft,
} from "@/lib/registry/draftStore";
import { configFingerprint, emptyDraft, type OneDraft } from "@/lib/registry/draft";

const ADDRESS = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B";
const OTHER = "0xe3A0795381521C177fc8c7723213df7B56A10a31";

/** A controllable EIP-1193 mock whose chain/accounts can change out of band. */
function makeWallet(chainId: number, accounts: string[] = [ADDRESS], uuid = "test") {
  const calls: string[] = [];
  let revokeUnsupported = false;
  const p = {
    chain: chainId,
    accounts,
    calls,
    setRevokeUnsupported(v: boolean) {
      revokeUnsupported = v;
    },
    on() {},
    removeListener() {},
    async request({ method, params }: { method: string; params?: unknown[] }) {
      calls.push(method);
      if (method === "wallet_revokePermissions") {
        if (revokeUnsupported) throw { code: 4200, message: "Unsupported method" };
        return null;
      }
      if (method === "eth_requestAccounts" || method === "eth_accounts") return p.accounts;
      if (method === "eth_chainId") return `0x${p.chain.toString(16)}`;
      if (method === "wallet_switchEthereumChain") {
        p.chain = Number.parseInt((params![0] as { chainId: string }).chainId, 16);
        return null;
      }
      if (method === "wallet_addEthereumChain") return null;
      throw new Error(`unexpected ${method}`);
    },
  };
  const wallet: DiscoveredWallet = {
    info: { uuid, name: "Test", icon: "", rdns: "test" },
    provider: p as unknown as DiscoveredWallet["provider"],
  };
  return { wallet, p };
}

beforeEach(() => {
  // Keep WalletConnect out of the picture so the mount stays synchronous.
  delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  window.localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe("ensureOnMonad (Sign / Create network check)", () => {
  it("requests the switch and reports success when off Monad", async () => {
    const { wallet, p } = makeWallet(1);
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    expect(result.current.chainId).toBe(1);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ensureOnMonad();
    });
    expect(ok).toBe(true);
    expect(p.chain).toBe(143);
    await waitFor(() => expect(result.current.chainId).toBe(143));
  });

  it("does not prompt a switch when already on Monad", async () => {
    const { wallet, p } = makeWallet(143);
    const spy = vi.spyOn(p, "request");
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });

    await act(async () => {
      await result.current.ensureOnMonad();
    });
    const switched = spy.mock.calls.some(
      (c) => (c[0] as { method: string }).method === "wallet_switchEthereumChain",
    );
    expect(switched).toBe(false);
  });
});

describe("connect uses a normal approval (not an account-management dialog)", () => {
  it("injected connect calls eth_requestAccounts and shows the account", async () => {
    const { wallet, p } = makeWallet(143, [ADDRESS], "io.metamask");
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    // A plain approval of the active account — no wallet_requestPermissions,
    // which is what forced MetaMask's account-management screen before.
    expect(p.calls).toContain("eth_requestAccounts");
    expect(p.calls).not.toContain("wallet_requestPermissions");
    expect(result.current.address?.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });
});

describe("disconnect de-authorises the wallet (no silent reconnect)", () => {
  it("revokes the injected site permission so the next connect prompts fresh", async () => {
    const { wallet, p } = makeWallet(143, [ADDRESS], "io.metamask");
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    await act(async () => {
      result.current.disconnect();
    });
    expect(p.calls).toContain("wallet_revokePermissions");
    expect(result.current.address).toBeNull();
    expect(result.current.selected).toBeNull();
  });

  it("still clears state when the wallet cannot revoke", async () => {
    const { wallet, p } = makeWallet(143, [ADDRESS], "io.metamask");
    p.setRevokeUnsupported(true);
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    await act(async () => {
      result.current.disconnect();
    });
    expect(result.current.address).toBeNull();
    expect(result.current.selected).toBeNull();
  });

  it("does not revoke for WalletConnect (it ends the session instead)", async () => {
    const { wallet, p } = makeWallet(143, [ADDRESS], "walletconnect");
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    await act(async () => {
      result.current.disconnect();
    });
    expect(p.calls).not.toContain("wallet_revokePermissions");
  });
});

describe("resync when returning to the tab", () => {
  it("re-reads the chain on visibilitychange (switch happened in the wallet app)", async () => {
    const { wallet, p } = makeWallet(1);
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    expect(result.current.chainId).toBe(1);

    // Wallet switched externally; no chainChanged event fired.
    p.chain = 143;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(result.current.chainId).toBe(143));
  });

  it("re-reads the active account on focus", async () => {
    const { wallet, p } = makeWallet(143);
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    expect(result.current.address?.toLowerCase()).toBe(ADDRESS.toLowerCase());

    p.accounts = [OTHER];
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(result.current.address?.toLowerCase()).toBe(OTHER.toLowerCase()));
  });
});

describe("Verified ONE draft survives a wallet disconnect", () => {
  it("keeps the draft and a collected signature after disconnect", async () => {
    // A secondary (OTHER) has signed under primary ADDRESS.
    resetDraftStoreCache();
    const deadline = String(Math.floor(Date.now() / 1000) + 3600);
    const base: OneDraft = {
      ...emptyDraft(),
      members: [ADDRESS as `0x${string}`, OTHER as `0x${string}`],
      primary: ADDRESS as `0x${string}`,
      salt: `0x${"0".repeat(63)}1` as `0x${string}`,
      deadline,
      signatures: [],
    };
    // The fingerprint must match the current config, or load-time pruning would
    // (correctly) discard it — which would defeat what this test is checking.
    const fp = configFingerprint(base);
    setDraft({
      ...base,
      signatures: [
        {
          wallet: OTHER as `0x${string}`,
          signature: `0x${"ab".repeat(65)}` as `0x${string}`,
          nonce: "0",
          deadline,
          configFingerprint: fp,
          signedAt: Date.now(),
        },
      ],
    });

    const { wallet } = makeWallet(143);
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    await act(async () => {
      result.current.disconnect();
    });

    // Force a reload from storage so this proves persistence, not a live cache.
    resetDraftStoreCache();
    const after = getDraft();
    expect(after.members).toHaveLength(2);
    expect(after.primary?.toLowerCase()).toBe(ADDRESS.toLowerCase());
    expect(after.signatures).toHaveLength(1);
    expect(after.signatures[0]!.wallet.toLowerCase()).toBe(OTHER.toLowerCase());
  });
});
