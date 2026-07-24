// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { PRIMARY, SECONDARY } = vi.hoisted(() => ({
  PRIMARY: "0xB09684f5486d1af80699BbC27f14dd5A905da873",
  SECONDARY: "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1",
}));

// The registry address must be set so the write ABI path is enabled.
vi.mock("@/lib/v2link/registry", async (orig) => {
  const mod = (await orig()) as Record<string, unknown>;
  return { ...mod, ONE_REGISTRY_V2_ADDRESS: PRIMARY };
});

const walletState = { address: PRIMARY as string | null };
vi.mock("@/lib/wallet/useWallet", () => ({
  useWallet: () => ({
    address: walletState.address,
    refreshAccount: async () => walletState.address,
    ensureOnMonad: async () => true,
    getWalletClient: () => null,
  }),
}));

vi.mock("@/app/verified/v2actions", () => ({ loadV2ProfileAction: vi.fn() }));

import { V2ManageWallets } from "./V2ManageWallets";
import type { V2Profile } from "@/app/verified/v2actions";

const profile = (over: Partial<V2Profile> = {}): V2Profile => ({
  address: "0x1111111111111111111111111111111111111111",
  primary: PRIMARY,
  members: [PRIMARY, SECONDARY],
  memberCount: 2,
  isActive: true,
  registry: PRIMARY,
  ...over,
}) as V2Profile;

beforeEach(() => {
  walletState.address = PRIMARY;
});
afterEach(cleanup);

describe("V2ManageWallets", () => {
  it("never offers to remove the primary wallet", () => {
    render(<V2ManageWallets initial={profile()} />);
    // Exactly one Remove control (for the secondary), never for the primary.
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtons).toHaveLength(1);
  });

  it("shows no Remove controls when a non-primary wallet is connected", () => {
    walletState.address = SECONDARY;
    render(<V2ManageWallets initial={profile()} />);
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    expect(screen.getByText(/only the primary wallet can add or remove/i)).toBeTruthy();
  });

  it("warns that removing the last linked wallet deactivates the identity", () => {
    render(<V2ManageWallets initial={profile({ memberCount: 2 })} />);
    expect(screen.getByRole("button", { name: /remove \(deactivates\)/i })).toBeTruthy();
  });
});
