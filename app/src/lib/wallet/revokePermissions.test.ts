import { describe, expect, it, vi } from "vitest";
import type { EIP1193Provider } from "viem";
import { revokeInjectedPermissions } from "./provider";

/** A provider whose `eth_accounts` reflects what it reports AFTER a revoke. */
function provider(
  afterAccounts: string[],
  opts: { revokeThrows?: boolean; accountsThrows?: boolean } = {},
): EIP1193Provider {
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "wallet_revokePermissions") {
        if (opts.revokeThrows) throw { code: 4200, message: "Unsupported method" };
        return null;
      }
      if (method === "eth_accounts") {
        if (opts.accountsThrows) throw new Error("cannot read accounts");
        return afterAccounts;
      }
      throw new Error(`unexpected ${method}`);
    }),
  } as unknown as EIP1193Provider;
}

describe("revokeInjectedPermissions", () => {
  it("reports de-authorised when the wallet stops returning accounts (MetaMask/Rabby/Phantom)", async () => {
    expect(await revokeInjectedPermissions(provider([]))).toEqual({ deauthorized: true });
  });

  it("reports NOT de-authorised when the account stays authorised (Backpack no-op)", async () => {
    expect(
      await revokeInjectedPermissions(provider(["0x017F9358AFcC7018dd683001FD33fD7D68230D8B"])),
    ).toEqual({ deauthorized: false });
  });

  it("still detects via eth_accounts when the wallet throws on revoke", async () => {
    const res = await revokeInjectedPermissions(
      provider(["0x017F9358AFcC7018dd683001FD33fD7D68230D8B"], { revokeThrows: true }),
    );
    expect(res.deauthorized).toBe(false);
  });

  it("treats a wallet that will not report accounts as cleared", async () => {
    expect(await revokeInjectedPermissions(provider([], { accountsThrows: true }))).toEqual({
      deauthorized: true,
    });
  });

  it("never throws", async () => {
    await expect(
      revokeInjectedPermissions(provider([], { revokeThrows: true, accountsThrows: true })),
    ).resolves.toEqual({ deauthorized: true });
  });
});
