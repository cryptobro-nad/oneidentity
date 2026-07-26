// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// Balance and NFT reads are left pending so nothing decodes chain data; the
// profile's identity/framing is what is under test here.
vi.mock("@/app/portfolio/actions", () => ({
  loadPortfolioAction: vi.fn(() => new Promise(() => {})),
  checkCollectionAction: vi.fn(),
}));
vi.mock("@/app/nft-actions", () => ({
  loadNftHoldingsAction: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/app/verified/actions", () => ({ loadProfileAction: vi.fn() }));

// A disconnected wallet: the profile is a public, read-only page.
vi.mock("@/lib/wallet/WalletProvider", () => ({
  useSharedWallet: () => ({
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
    disconnectNotice: null,
    connect: vi.fn(),
    connectWalletConnect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
    checkNetwork: vi.fn(),
    refreshAccount: vi.fn(),
    getWalletClient: vi.fn(),
  }),
}));

import { OneProfileClient } from "./OneProfileClient";

const ONE = "0x1139dec3A681C96807D8C277601655A707494AaA";
const A = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B"; // primary
const B = "0xe3A0795381521C177fc8c7723213df7B56A10a31"; // secondary
const REGISTRY = "0x00000000000000000000000000000000000000A1";

const activeProfile = {
  address: ONE as `0x${string}`,
  isActive: true,
  primary: A as `0x${string}`,
  members: [A, B] as `0x${string}`[],
  memberCount: 2,
  registry: REGISTRY as `0x${string}`,
  blockNumber: "89513310",
};

const inactiveProfile = { ...activeProfile, isActive: false, members: [A] as `0x${string}`[], memberCount: 1 };

function setupClipboard() {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
  return { user, writeText };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OneProfileClient — identity", () => {
  it("shows the full identity address and active state", () => {
    render(<OneProfileClient initial={activeProfile} />);
    expect(screen.getByText(ONE)).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("labels an inactive identity", () => {
    render(<OneProfileClient initial={inactiveProfile} />);
    expect(screen.getByText("Inactive")).toBeTruthy();
  });

  it("reflects the linked-wallet count", () => {
    render(<OneProfileClient initial={activeProfile} />);
    expect(screen.getByText(/one identity, 2 wallets/i)).toBeTruthy();
  });

  it("labels the primary and secondary wallets", () => {
    render(<OneProfileClient initial={activeProfile} />);
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(screen.getByText("Secondary")).toBeTruthy();
  });

  it("carries the safety wording: an identity address is not a wallet", () => {
    render(<OneProfileClient initial={activeProfile} />);
    expect(screen.getByText(/identity address, not a wallet/i)).toBeTruthy();
    expect(screen.getByText(/do not send funds to it/i)).toBeTruthy();
  });

  it("states no funds moved, no custody", () => {
    const { container } = render(<OneProfileClient initial={activeProfile} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/no funds moved/i);
    expect(text).toMatch(/never took custody/i);
  });
});

describe("OneProfileClient — copy and share", () => {
  it("copies the complete identity address", async () => {
    const { user, writeText } = setupClipboard();
    render(<OneProfileClient initial={activeProfile} />);
    await user.click(screen.getByRole("button", { name: /copy identity address/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ONE));
    expect((writeText.mock.calls[0]![0] as string)).toHaveLength(42);
  });

  it("copies the profile link from the current origin, not a hardcoded host", async () => {
    const { user, writeText } = setupClipboard();
    render(<OneProfileClient initial={activeProfile} />);
    await user.click(screen.getByRole("button", { name: /copy profile link/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/one/${ONE}`),
    );
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).not.toMatch(/oneidentity\.app|vercel\.app/);
  });
});

describe("OneProfileClient — links are real, none fake", () => {
  it("links to the real explorers and embeds the lookup", () => {
    render(<OneProfileClient initial={activeProfile} />);
    // Visible explorer links (AddressChip's own "View" links carry the explorer
    // name only in their aria-label, so match on the visible text here).
    expect(screen.getByText("MonadVision")).toBeTruthy();
    expect(screen.getByText("Monadscan")).toBeTruthy();
    // Compact lookup is present for resolving another identity.
    expect(screen.getByText(/look up another one/i)).toBeTruthy();
  });

  it("has no fabricated social links", () => {
    render(<OneProfileClient initial={activeProfile} />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => /twitter\.com|x\.com/i.test(h))).toBe(false);
    expect(screen.queryByRole("link", { name: /^docs$|discord|telegram/i })).toBeNull();
  });
});
