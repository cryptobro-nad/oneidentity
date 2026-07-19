// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ActiveOneCard } from "./ActiveOneCard";
import type { MembershipActionResult } from "@/app/verified/actions";
import type { PortfolioAddress } from "@/lib/types";

const ONE_ADDR = "0x1139dec3A681C96807D8C277601655A707494AaA" as PortfolioAddress;
const PRIMARY = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;
const SECONDARY = "0xe3A0795381521C177fc8c7723213df7B56A10a31" as PortfolioAddress;

type Linked = Extract<MembershipActionResult, { state: "linked" }>;

const linked = (over: Partial<Linked> = {}): Linked => ({
  state: "linked",
  oneAddress: ONE_ADDR,
  role: "primary",
  isActive: true,
  memberCount: 2,
  ...over,
});

/**
 * Sets up user-event, then replaces the clipboard with a spy.
 *
 * Order matters: `userEvent.setup()` installs its own clipboard stub, so a spy
 * defined beforehand is silently overwritten and never sees a call.
 */
function setupWithClipboard(behaviour: "ok" | "fail" = "ok") {
  const user = userEvent.setup();
  const writeText =
    behaviour === "ok"
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(new Error("denied"));

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });

  return { user, writeText };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActiveOneCard — identity and role", () => {
  it("shows the ONE address in full, not shortened", () => {
    render(<ActiveOneCard membership={linked()} connectedAddress={PRIMARY} />);
    expect(screen.getByText(ONE_ADDR)).toBeTruthy();
  });

  it("shows the Primary role for a primary wallet", () => {
    render(<ActiveOneCard membership={linked({ role: "primary" })} connectedAddress={PRIMARY} />);
    expect(screen.getByText("Primary")).toBeTruthy();
  });

  it("shows the Secondary role for a secondary wallet", () => {
    render(
      <ActiveOneCard membership={linked({ role: "secondary" })} connectedAddress={SECONDARY} />,
    );
    expect(screen.getByText("Secondary")).toBeTruthy();
  });

  it("shows the linked wallet count and active status", () => {
    render(<ActiveOneCard membership={linked({ memberCount: 3 })} connectedAddress={PRIMARY} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("labels an inactive identity as inactive", () => {
    render(
      <ActiveOneCard
        membership={linked({ isActive: false, memberCount: 1 })}
        connectedAddress={PRIMARY}
      />,
    );
    expect(screen.getByText("Inactive")).toBeTruthy();
  });
});

describe("ActiveOneCard — copy behaviour", () => {
  it("copies the COMPLETE ONE address, never the shortened form", async () => {
    const { user, writeText } = setupWithClipboard();
    render(<ActiveOneCard membership={linked()} connectedAddress={PRIMARY} />);

    await user.click(screen.getByRole("button", { name: /copy one address/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ONE_ADDR));
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toHaveLength(42);
    expect(copied).not.toContain("…");
  });

  it("builds the profile link from window.location.origin", async () => {
    const { user, writeText } = setupWithClipboard();
    render(<ActiveOneCard membership={linked()} connectedAddress={PRIMARY} />);

    await user.click(screen.getByRole("button", { name: /copy profile link/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/one/${ONE_ADDR}`),
    );
  });

  it("hardcodes no host in the copied link", async () => {
    const { user, writeText } = setupWithClipboard();
    render(<ActiveOneCard membership={linked()} connectedAddress={PRIMARY} />);

    await user.click(screen.getByRole("button", { name: /copy profile link/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0]![0] as string;
    // Whatever origin the environment uses, the component must have used it —
    // this is what makes the same build correct on localhost, preview and prod.
    expect(copied.startsWith(window.location.origin)).toBe(true);
    expect(copied).toBe(`${window.location.origin}/one/${ONE_ADDR}`);
    expect(copied).not.toMatch(/oneidentity\.app|vercel\.app/);
  });

  it("announces the copy through an aria-live region", async () => {
    const { user } = setupWithClipboard();
    render(<ActiveOneCard membership={linked()} connectedAddress={PRIMARY} />);

    await user.click(screen.getByRole("button", { name: /copy one address/i }));
    expect(await screen.findByText("ONE address copied.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /copy profile link/i }));
    expect(await screen.findByText("Profile link copied.")).toBeTruthy();
  });

  it("reports a clipboard failure instead of claiming success", async () => {
    const { user } = setupWithClipboard("fail");
    render(<ActiveOneCard membership={linked()} connectedAddress={PRIMARY} />);

    await user.click(screen.getByRole("button", { name: /copy one address/i }));
    expect(await screen.findByText(/copying failed/i)).toBeTruthy();
  });
});

describe("ActiveOneCard — navigation", () => {
  it("links View my ONE to the correct profile path", () => {
    render(<ActiveOneCard membership={linked()} connectedAddress={PRIMARY} />);
    const link = screen.getByRole("link", { name: /view my one/i });
    expect(link.getAttribute("href")).toBe(`/one/${ONE_ADDR}`);
  });
});
