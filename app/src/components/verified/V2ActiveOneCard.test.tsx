// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { V2ActiveOneCard } from "./V2ActiveOneCard";
import type { V2Profile } from "@/app/verified/v2actions";

const PRIMARY = "0xB09684f5486d1af80699BbC27f14dd5A905da873";
const SECONDARY = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1";
const ONE = "0x1139dec3A681C96807D8C277601655A707494AaA";

const profile = (over: Partial<V2Profile> = {}): V2Profile =>
  ({
    address: ONE,
    primary: PRIMARY,
    members: [PRIMARY, SECONDARY],
    memberCount: 2,
    isActive: true,
    registry: PRIMARY,
    ...over,
  }) as V2Profile;

afterEach(cleanup);

describe("V2ActiveOneCard", () => {
  it("shows the identity address, count, and links to the V2 profile route", () => {
    render(<V2ActiveOneCard profile={profile()} connectedAddress={PRIMARY} />);
    expect(screen.getByText(ONE)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    const view = screen.getByRole("link", { name: /view my ONE/i }) as HTMLAnchorElement;
    expect(view.getAttribute("href")).toBe(`/one-v2/${ONE}`);
  });

  it("labels the connected wallet's role as Primary or Secondary", () => {
    const { rerender } = render(<V2ActiveOneCard profile={profile()} connectedAddress={PRIMARY} />);
    expect(screen.getByText("Primary")).toBeTruthy();
    rerender(<V2ActiveOneCard profile={profile()} connectedAddress={SECONDARY} />);
    expect(screen.getByText("Secondary")).toBeTruthy();
  });
});
