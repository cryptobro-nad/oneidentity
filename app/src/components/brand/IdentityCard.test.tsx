// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { IdentityCard } from "./IdentityCard";

afterEach(cleanup);

const PROPS = {
  address: "0x1139…4AaA",
  primary: "0x017F…0D8B",
  secondary: "0xe3A0…0a31",
  linkedCount: 2,
  profileHref: "/one/0x1139dec3A681C96807D8C277601655A707494AaA",
};

describe("IdentityCard", () => {
  it("shows the identity address and its active state", () => {
    render(<IdentityCard {...PROPS} />);
    expect(screen.getByText(PROPS.address)).toBeTruthy();
    expect(screen.getByText(/active/i)).toBeTruthy();
  });

  it("shows the primary and secondary wallets with their roles", () => {
    const { container } = render(<IdentityCard {...PROPS} />);
    expect(screen.getByText(PROPS.primary)).toBeTruthy();
    expect(screen.getByText(PROPS.secondary)).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).toMatch(/PRIMARY/);
    expect(text).toMatch(/SECONDARY/);
  });

  it("reports the linked-wallet count", () => {
    const { container } = render(<IdentityCard {...PROPS} linkedCount={2} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/2\s*linked wallets/i);
  });

  it("carries the safety wording: an identity address is not a wallet", () => {
    render(<IdentityCard {...PROPS} />);
    expect(
      screen.getByText(/identity address, not a wallet\. do not send funds to it/i),
    ).toBeTruthy();
  });

  it("links to the correct /one/<address> profile", () => {
    render(<IdentityCard {...PROPS} />);
    const link = screen.getByRole("link", { name: /oneidentity\.app\/one\//i });
    expect(link.getAttribute("href")).toBe(PROPS.profileHref);
    // The href carries the full, real address, not the truncated display form.
    expect(link.getAttribute("href")).toMatch(/^\/one\/0x[a-fA-F0-9]{40}$/);
  });

  it("omits the profile link when no href is provided", () => {
    render(
      <IdentityCard
        address={PROPS.address}
        primary={PROPS.primary}
        secondary={PROPS.secondary}
        linkedCount={PROPS.linkedCount}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
