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
  let rejectPermissions = false;
  let permissionsUnsupported = false;
  const p = {
    chain: chainId,
    accounts,
    calls,
    setRejectPermissions(v: boolean) {
      rejectPermissions = v;
    },
    setPermissionsUnsupported(v: boolean) {
      permissionsUnsupported = v;
    },
    on() {},
    removeListener() {},
    async request({ method, params }: { method: string; params?: unknown[] }) {
      calls.push(method);
      if (method === "wallet_requestPermissions") {
        if (rejectPermissions) throw { code: 4001, message: "User rejected the request" };
        if (permissionsUnsupported) throw { code: 4200, message: "Unsupported method" };
        return [{ parentCapability: "eth_accounts" }];
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

describe("account chooser on connect (no silent reconnect after disconnect)", () => {
  it("asks an injected wallet for an explicit account choice", async () => {
    const { wallet, p } = makeWallet(143, [ADDRESS], "io.metamask");
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    // The permission request is what opens MetaMask's account selector.
    expect(p.calls).toContain("wallet_requestPermissions");
    expect(result.current.address?.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });

  it("does not force a chooser for WalletConnect (its modal already chose)", async () => {
    const { wallet, p } = makeWallet(143, [ADDRESS], "walletconnect");
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    expect(p.calls).not.toContain("wallet_requestPermissions");
  });

  it("falls back to a plain connect when the wallet can't force a chooser", async () => {
    const { wallet, p } = makeWallet(143, [ADDRESS], "io.metamask");
    p.setPermissionsUnsupported(true);
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    // It tried the chooser, then fell back — the on-screen copy tells the user
    // to switch accounts in the extension.
    expect(p.calls).toContain("wallet_requestPermissions");
    expect(p.calls).toContain("eth_requestAccounts");
    expect(result.current.address?.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });

  it("aborts (no silent connect) when the user rejects the account chooser", async () => {
    const { wallet, p } = makeWallet(143, [ADDRESS], "io.metamask");
    p.setRejectPermissions(true);
    const { result } = renderHook(() => useWallet());
    await act(async () => {
      await result.current.connect(wallet);
    });
    // Rejection is a real "no": no account is attached and eth_requestAccounts
    // was never used to sneak the previous account back in.
    expect(result.current.address).toBeNull();
    expect(p.calls).not.toContain("eth_requestAccounts");
    expect(result.current.error).toBeTruthy();
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
