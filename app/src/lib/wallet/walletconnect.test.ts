import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isWalletConnectConfigured,
  resetWalletConnectCache,
  walletConnectProjectId,
  WALLETCONNECT_UUID,
} from "./walletconnect";

const ORIGINAL = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

beforeEach(() => {
  resetWalletConnectCache();
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  else process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = ORIGINAL;
  resetWalletConnectCache();
  vi.restoreAllMocks();
});

describe("project id handling", () => {
  it("reports configured when a project id is present", () => {
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = "test-project-id";
    expect(isWalletConnectConfigured()).toBe(true);
    expect(walletConnectProjectId()).toBe("test-project-id");
  });

  it("reports unconfigured when the variable is missing", () => {
    delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
    expect(isWalletConnectConfigured()).toBe(false);
    expect(walletConnectProjectId()).toBeUndefined();
  });

  it("treats an empty string as unconfigured", () => {
    // A blank value in .env is a very common mistake; it must not be treated as
    // configured, or the UI would offer a connection that cannot work.
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = "";
    expect(isWalletConnectConfigured()).toBe(false);
  });

  it("does not crash when the variable is absent", () => {
    delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
    expect(() => isWalletConnectConfigured()).not.toThrow();
    expect(() => walletConnectProjectId()).not.toThrow();
  });
});

describe("connecting without configuration", () => {
  it("rejects with a clear message instead of throwing something opaque", async () => {
    delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
    const { getWalletConnectProvider } = await import("./walletconnect");
    await expect(getWalletConnectProvider()).rejects.toThrow(/not configured/i);
  });

  it("never imports the WalletConnect SDK when unconfigured", async () => {
    delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
    const { walletConnectEntry } = await import("./walletconnect");
    // Failing before the dynamic import keeps the SDK out of the bundle path
    // for deployments that do not use it.
    await expect(walletConnectEntry()).rejects.toThrow(/not configured/i);
  });
});

describe("secret hygiene", () => {
  it("does not log the project id", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = "super-secret-looking-value";
    isWalletConnectConfigured();
    walletConnectProjectId();

    for (const spy of [log, warn, error]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain("super-secret-looking-value");
      }
    }
  });

  it("keeps no project id in the module source", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./walletconnect.ts", import.meta.url), "utf8");
    // Only the env lookup should appear — never a literal id.
    expect(source).toContain("process.env.NEXT_PUBLIC_REOWN_PROJECT_ID");
    expect(source).not.toMatch(/projectId\s*[:=]\s*["'][0-9a-f]{16,}["']/i);
  });
});

describe("wallet list entry", () => {
  it("uses a stable uuid so disconnect can recognise it", () => {
    expect(WALLETCONNECT_UUID).toBe("walletconnect");
  });
});
