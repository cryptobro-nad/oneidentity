// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// The homepage embeds the real OneLookup (a client component). Stub only the
// navigation + server action it needs — no behavior is exercised here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/verified/actions", () => ({ resolveOneLookupAction: vi.fn() }));

import LandingPage from "./page";
import { SiteFooter } from "@/components/layout/SiteFooter";

afterEach(cleanup);

// The homepage as a visitor sees it: page content plus the global footer.
function renderHome() {
  return render(
    <>
      <LandingPage />
      <SiteFooter />
    </>,
  );
}

const EXAMPLE_ONE = "/one/0x1139dec3A681C96807D8C277601655A707494AaA";

describe("Homepage smoke", () => {
  it("routes the Watch-only calls to action to /portfolio", () => {
    renderHome();
    expect(
      screen.getByRole("link", { name: /view my wallets together/i }).getAttribute("href"),
    ).toBe("/portfolio");
    expect(
      screen.getByRole("link", { name: /open watch-only portfolio/i }).getAttribute("href"),
    ).toBe("/portfolio");
  });

  it("routes the Verified ONE calls to action to /verified", () => {
    renderHome();
    const verifiedCtas = screen.getAllByRole("link", { name: /create a verified one/i });
    expect(verifiedCtas.length).toBeGreaterThanOrEqual(1);
    for (const cta of verifiedCtas) {
      expect(cta.getAttribute("href")).toBe("/verified");
    }
  });

  it("anchors #identity and #how-it-works exist for in-page navigation", () => {
    const { container } = renderHome();
    expect(container.querySelector("#identity")).not.toBeNull();
    expect(container.querySelector("#how-it-works")).not.toBeNull();
  });

  it("shows a real example profile link to a full ONE address", () => {
    renderHome();
    const example = screen.getByRole("link", { name: /oneidentity\.app\/one\//i });
    expect(example.getAttribute("href")).toBe(EXAMPLE_ONE);
    expect(example.getAttribute("href")).toMatch(/^\/one\/0x[a-fA-F0-9]{40}$/);
  });

  it("has no placeholder or fabricated links", () => {
    const { container } = renderHome();

    // No dead placeholder anchors.
    expect(container.querySelectorAll('a[href="#"]').length).toBe(0);

    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    // No fake social links.
    expect(hrefs.some((h) => /twitter\.com|x\.com/i.test(h))).toBe(false);
    // No fabricated Docs link.
    expect(screen.queryByRole("link", { name: /^docs$|documentation/i })).toBeNull();
  });

  it("shows no fabricated block number or chain data", () => {
    const { container } = renderHome();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/block\s*(number|height|#|\d)/i);
  });
});

describe("Homepage product statement wording", () => {
  it("uses 'Multiple wallets' and no longer says 'Many wallets'", () => {
    const { container } = renderHome();
    const text = container.textContent ?? "";
    expect(text).toMatch(/multiple wallets/i);
    expect(text).not.toMatch(/many wallets/i);
  });
});
