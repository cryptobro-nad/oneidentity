// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { PRIMARY, SECONDARY } = vi.hoisted(() => ({
  PRIMARY: "0xB09684f5486d1af80699BbC27f14dd5A905da873",
  SECONDARY: "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1",
}));

vi.mock("@/lib/v2link/registry", async (orig) => {
  const mod = (await orig()) as Record<string, unknown>;
  return { ...mod, ONE_REGISTRY_V2_ADDRESS: PRIMARY };
});

vi.mock("@/lib/wallet/useWallet", () => ({
  useWallet: () => ({
    address: PRIMARY,
    refreshAccount: async () => PRIMARY,
    ensureOnMonad: async () => true,
    getWalletClient: () => null,
  }),
}));

import { LinkWalletV2 } from "./LinkWalletV2";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ id: "c1", primary: PRIMARY, secondary: SECONDARY, amountWei: "15000000000000000", expiresAt: 9_999_999_999 }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
});

describe("LinkWalletV2", () => {
  it("shows the approved funds note and hides technical terms", () => {
    render(<LinkWalletV2 />);
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).toContain("one never receives, holds, forwards, or controls it");
    for (const term of ["attestation", "verifier", "indexer", "eip-712", "challenge"]) {
      expect(text).not.toContain(term);
    }
  });

  it("moves to the waiting state and shows the exact amount after starting a link", async () => {
    render(<LinkWalletV2 />);
    fireEvent.change(screen.getByPlaceholderText("0x…"), { target: { value: SECONDARY } });
    fireEvent.click(screen.getByRole("button", { name: /link wallet/i }));

    await waitFor(() => expect(screen.getByText(/send exactly/i)).toBeTruthy());
    expect(screen.getByText(/0\.015 MON/i)).toBeTruthy();
    expect(screen.getByText(/left/i)).toBeTruthy(); // countdown visible
  });

  it("rejects linking a wallet equal to the primary", async () => {
    render(<LinkWalletV2 />);
    fireEvent.change(screen.getByPlaceholderText("0x…"), { target: { value: PRIMARY } });
    fireEvent.click(screen.getByRole("button", { name: /link wallet/i }));
    await waitFor(() => expect(screen.getByText(/other than the primary/i)).toBeTruthy());
  });
});
