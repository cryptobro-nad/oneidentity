// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/image", () => ({ default: () => null }));

const wallet = {
  wallets: [] as { info: { uuid: string; name: string; icon: string } }[],
  selected: null as { info: { name: string } } | null,
  address: null as string | null,
  chainId: 143 as number | null,
  connecting: false,
  error: null as string | null,
  isOnMonad: true,
  walletConnectAvailable: false,
  restoring: false,
  switching: false,
  disconnectNotice: null as string | null,
  connect: vi.fn(),
  connectWalletConnect: vi.fn(),
  disconnect: vi.fn(),
  switchNetwork: vi.fn(),
};
vi.mock("@/lib/wallet/WalletProvider", () => ({ useSharedWallet: () => wallet }));

import { HeaderWallet } from "./HeaderWallet";

const reset = () => {
  wallet.address = null;
  wallet.wallets = [];
  wallet.isOnMonad = true;
  wallet.disconnect.mockClear();
};

afterEach(() => {
  cleanup();
  reset();
});

describe("HeaderWallet", () => {
  it("shows a Connect button when disconnected and opens a wallet menu", () => {
    wallet.wallets = [{ info: { uuid: "mm", name: "MetaMask", icon: "" } }];
    render(<HeaderWallet />);
    const trigger = screen.getByRole("button", { name: /connect/i });
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: /metamask/i })).toBeTruthy();
  });

  it("shows the shortened address and a Disconnect action when connected", () => {
    wallet.address = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B";
    render(<HeaderWallet />);
    const trigger = screen.getByRole("button", { name: /0x017F/i });
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);
    const disconnect = screen.getByRole("button", { name: /disconnect/i });
    fireEvent.click(disconnect);
    expect(wallet.disconnect).toHaveBeenCalled();
  });

  it("offers a network switch when connected to the wrong chain", () => {
    wallet.address = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B";
    wallet.isOnMonad = false;
    render(<HeaderWallet />);
    fireEvent.click(screen.getByRole("button", { name: /0x017F/i }));
    expect(screen.getByRole("button", { name: /switch to monad/i })).toBeTruthy();
  });
});
