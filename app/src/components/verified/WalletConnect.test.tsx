// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="wallet-icon">{alt}</span>,
}));

import { WalletConnect } from "./WalletConnect";
import type { useWallet } from "@/lib/wallet/useWallet";
import type { PortfolioAddress } from "@/lib/types";

type Wallet = ReturnType<typeof useWallet>;

const ADDRESS = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;

const injectedWallet = (name: string, uuid: string) => ({
  info: { uuid, name, icon: "", rdns: `com.${name.toLowerCase()}` },
  provider: {} as never,
});

function walletState(over: Partial<Wallet> = {}): Wallet {
  return {
    wallets: [],
    selected: null,
    address: null,
    chainId: null,
    connecting: false,
    error: null,
    isOnMonad: false,
    walletConnectAvailable: false,
    restoring: false,
    switching: false,
    connect: vi.fn(),
    connectWalletConnect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
    checkNetwork: vi.fn(),
    refreshAccount: vi.fn(),
    getWalletClient: vi.fn(),
    ...over,
  } as unknown as Wallet;
}

const wcWallet = { info: { uuid: "walletconnect", name: "WalletConnect", icon: "", rdns: "org.walletconnect" }, provider: {} as never };

/** Overrides the UA so the mobile/desktop wording can be exercised. */
function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setUserAgent(DESKTOP_UA);
});

describe("injected wallets still work", () => {
  it("lists every discovered injected wallet by name", () => {
    render(
      <WalletConnect
        wallet={walletState({
          wallets: [injectedWallet("MetaMask", "mm"), injectedWallet("Rabby", "rb")],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "MetaMask" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rabby" })).toBeTruthy();
  });

  it("connects with the chosen injected wallet", async () => {
    const connect = vi.fn();
    const mm = injectedWallet("MetaMask", "mm");
    const user = userEvent.setup();

    render(<WalletConnect wallet={walletState({ wallets: [mm], connect })} />);
    await user.click(screen.getByRole("button", { name: "MetaMask" }));

    expect(connect).toHaveBeenCalledWith(mm);
  });

  it("does not duplicate a wallet that is also reachable via WalletConnect", () => {
    render(
      <WalletConnect
        wallet={walletState({
          wallets: [injectedWallet("MetaMask", "mm")],
          walletConnectAvailable: true,
        })}
      />,
    );
    // Exactly one MetaMask entry, plus a distinct WalletConnect action.
    expect(screen.getAllByRole("button", { name: "MetaMask" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /scan with a mobile wallet/i })).toBeTruthy();
  });
});

describe("WalletConnect availability", () => {
  it("offers the mobile action on a phone when configured", () => {
    setUserAgent(MOBILE_UA);
    render(<WalletConnect wallet={walletState({ walletConnectAvailable: true })} />);
    expect(screen.getByRole("button", { name: /connect mobile wallet/i })).toBeTruthy();
  });

  it("offers a QR connection on desktop when configured", () => {
    render(<WalletConnect wallet={walletState({ walletConnectAvailable: true })} />);
    expect(screen.getByRole("button", { name: /connect with walletconnect/i })).toBeTruthy();
    expect(screen.getByText(/shows a qr code/i)).toBeTruthy();
  });

  it("triggers connectWalletConnect when clicked", async () => {
    const connectWalletConnect = vi.fn();
    const user = userEvent.setup();

    render(
      <WalletConnect wallet={walletState({ walletConnectAvailable: true, connectWalletConnect })} />,
    );
    await user.click(screen.getByRole("button", { name: /connect with walletconnect/i }));

    expect(connectWalletConnect).toHaveBeenCalled();
  });

  it("hides the action entirely when no project id is configured", () => {
    render(<WalletConnect wallet={walletState({ walletConnectAvailable: false })} />);
    expect(screen.queryByRole("button", { name: /walletconnect|mobile wallet/i })).toBeNull();
  });

  it("still renders without crashing when unconfigured", () => {
    expect(() =>
      render(<WalletConnect wallet={walletState({ walletConnectAvailable: false })} />),
    ).not.toThrow();
    expect(screen.getByText(/connect a wallet/i)).toBeTruthy();
  });
});

describe("guidance never misleads by device", () => {
  it("does NOT tell a phone user to install a desktop extension", () => {
    setUserAgent(MOBILE_UA);
    render(<WalletConnect wallet={walletState()} />);

    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/install MetaMask or Rabby/i);
    expect(body).toMatch(/wallet app's browser/i);
  });

  it("does suggest an extension on desktop with no wallet", () => {
    render(<WalletConnect wallet={walletState()} />);
    expect(screen.getByText(/install MetaMask or Rabby/i)).toBeTruthy();
  });
});

describe("session restoration", () => {
  it("shows a restoring message instead of a false Connect-wallet flash", () => {
    render(<WalletConnect wallet={walletState({ restoring: true })} />);

    expect(screen.getByText(/restoring wallet session/i)).toBeTruthy();
    // The bug this prevents: a still-connected user briefly seeing "Connect a
    // wallet" and concluding the session was lost.
    expect(screen.queryByText(/^Connect a wallet$/)).toBeNull();
  });

  it("shows the connect UI once restoration finds nothing", () => {
    render(<WalletConnect wallet={walletState({ restoring: false })} />);
    expect(screen.getByText(/connect a wallet/i)).toBeTruthy();
    expect(screen.queryByText(/restoring wallet session/i)).toBeNull();
  });

  it("shows no error when there was simply no session to restore", () => {
    render(<WalletConnect wallet={walletState({ restoring: false })} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the connected wallet immediately when a session was restored", () => {
    render(
      <WalletConnect
        wallet={walletState({
          restoring: false,
          address: ADDRESS,
          chainId: 143,
          isOnMonad: true,
          selected: wcWallet,
        })}
      />,
    );
    expect(screen.getByText(/0x017F…0D8B/)).toBeTruthy();
    expect(screen.getByText(/via WalletConnect/)).toBeTruthy();
  });

  it("keeps a restored WRONG-NETWORK session visibly connected", () => {
    render(
      <WalletConnect
        wallet={walletState({
          address: ADDRESS,
          chainId: 1,
          isOnMonad: false,
          selected: wcWallet,
        })}
      />,
    );

    // Connected AND warned — network state must not decide connectedness.
    expect(screen.getByText(/0x017F…0D8B/)).toBeTruthy();
    expect(screen.getByText(/wrong network/i)).toBeTruthy();
    expect(screen.queryByText(/^Connect a wallet$/)).toBeNull();
  });
});

describe("network switching UI", () => {
  const wrongNetwork = (over = {}) =>
    walletState({ address: ADDRESS, chainId: 1, isOnMonad: false, selected: wcWallet, ...over });

  it("renders errors raised while connected", () => {
    // Previously these were stored but never rendered, so the button looked
    // like it did nothing at all.
    render(<WalletConnect wallet={wrongNetwork({ error: "You declined the network change in your wallet." })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/declined the network change/i);
  });

  it("shows actionable manual instructions alongside the error", () => {
    render(<WalletConnect wallet={wrongNetwork({ error: "Your wallet is still on a different network." })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/open your wallet, select monad mainnet/i);
  });

  it("disables both buttons and relabels while switching", () => {
    render(<WalletConnect wallet={wrongNetwork({ switching: true })} />);

    const switchBtn = screen.getByRole("button", { name: /switching network/i }) as HTMLButtonElement;
    const checkBtn = screen.getByRole("button", { name: /check network again/i }) as HTMLButtonElement;
    expect(switchBtn.disabled).toBe(true);
    expect(checkBtn.disabled).toBe(true);
  });

  it("tells WalletConnect users to approve in their wallet app", () => {
    render(<WalletConnect wallet={wrongNetwork({ switching: true })} />);
    expect(screen.getByText(/approve the network change in your wallet app/i)).toBeTruthy();
  });

  it("does not show the wallet-app prompt for an injected wallet", () => {
    render(
      <WalletConnect
        wallet={wrongNetwork({
          switching: true,
          selected: injectedWallet("MetaMask", "mm"),
        })}
      />,
    );
    expect(screen.queryByText(/approve the network change in your wallet app/i)).toBeNull();
  });

  it("calls checkNetwork from the manual fallback button", async () => {
    const checkNetwork = vi.fn();
    const user = userEvent.setup();

    render(<WalletConnect wallet={wrongNetwork({ checkNetwork })} />);
    await user.click(screen.getByRole("button", { name: /check network again/i }));

    expect(checkNetwork).toHaveBeenCalled();
  });

  it("keeps the wallet connected after a failed switch", async () => {
    render(<WalletConnect wallet={wrongNetwork({ error: "The network change request failed." })} />);
    // Still connected, still showing the address, still offering a retry.
    expect(screen.getByText(/0x017F…0D8B/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /switch to monad mainnet/i })).toBeTruthy();
  });

  it("renders an error even when on the correct network", () => {
    render(
      <WalletConnect
        wallet={walletState({
          address: ADDRESS,
          chainId: 143,
          isOnMonad: true,
          error: "Something went wrong.",
        })}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/something went wrong/i);
  });

  it("shows no network warning once on Monad", () => {
    render(
      <WalletConnect
        wallet={walletState({ address: ADDRESS, chainId: 143, isOnMonad: true })}
      />,
    );
    expect(screen.queryByText(/wrong network/i)).toBeNull();
  });
});

describe("connected state", () => {
  it("shows the connected account and connector name", () => {
    render(
      <WalletConnect
        wallet={walletState({
          address: ADDRESS,
          chainId: 143,
          isOnMonad: true,
          selected: injectedWallet("WalletConnect", "walletconnect"),
        })}
      />,
    );
    expect(screen.getByText(/0x017F…0D8B/)).toBeTruthy();
    expect(screen.getByText(/via WalletConnect/)).toBeTruthy();
  });

  it("calls the real disconnect, which ends the session", async () => {
    const disconnect = vi.fn();
    const user = userEvent.setup();

    render(
      <WalletConnect
        wallet={walletState({ address: ADDRESS, chainId: 143, isOnMonad: true, disconnect })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /disconnect/i }));

    expect(disconnect).toHaveBeenCalled();
  });

  it("blocks on the wrong network regardless of how the wallet connected", () => {
    render(
      <WalletConnect
        wallet={walletState({
          address: ADDRESS,
          chainId: 1,
          isOnMonad: false,
          selected: injectedWallet("WalletConnect", "walletconnect"),
        })}
      />,
    );
    expect(screen.getByText(/wrong network/i)).toBeTruthy();
    expect(screen.getByText(/chain 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /switch to monad mainnet/i })).toBeTruthy();
  });

  it("offers network switching from a WalletConnect session", async () => {
    const switchNetwork = vi.fn();
    const user = userEvent.setup();

    render(
      <WalletConnect
        wallet={walletState({
          address: ADDRESS,
          chainId: 1,
          isOnMonad: false,
          switchNetwork,
          selected: injectedWallet("WalletConnect", "walletconnect"),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /switch to monad mainnet/i }));

    expect(switchNetwork).toHaveBeenCalled();
  });

  it("surfaces a connection error", () => {
    render(<WalletConnect wallet={walletState({ error: "Session rejected" })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/session rejected/i);
  });

  it("disables buttons while connecting", () => {
    render(
      <WalletConnect
        wallet={walletState({
          connecting: true,
          walletConnectAvailable: true,
          wallets: [injectedWallet("MetaMask", "mm")],
        })}
      />,
    );
    expect((screen.getByRole("button", { name: "MetaMask" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
