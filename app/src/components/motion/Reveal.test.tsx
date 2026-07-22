// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Reveal } from "./Reveal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// These tests are about user safety, not animation: content must always be
// reachable and must never stay stuck in its pre-reveal (hidden) state when the
// mechanics that would reveal it are absent. They deliberately avoid asserting
// durations, easing, or brittle class sequences.

describe("Reveal — content is always reachable", () => {
  it("renders its children into the document", () => {
    render(
      <Reveal>
        <p>Watch-only needs no signature.</p>
      </Reveal>,
    );
    expect(screen.getByText(/watch-only needs no signature/i)).toBeTruthy();
  });

  it("does not leave content hidden when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(
      <Reveal>
        <p>Important disclosure.</p>
      </Reveal>,
    );
    // Reachable...
    expect(screen.getByText(/important disclosure/i)).toBeTruthy();
    // ...and moved into the revealed (visible) state rather than stuck hidden.
    expect(container.firstElementChild?.classList.contains("in")).toBe(true);
  });

  it("reveals content immediately when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = render(
      <Reveal>
        <p>Reduced-motion disclosure.</p>
      </Reveal>,
    );
    expect(screen.getByText(/reduced-motion disclosure/i)).toBeTruthy();
    expect(container.firstElementChild?.classList.contains("in")).toBe(true);
  });

  it("does not require the reveal to fire for content to be accessible", () => {
    // An observer that never reports an intersection (e.g. content below the
    // fold, or a browser that never scrolls it into view).
    class SilentObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", SilentObserver);

    render(
      <Reveal>
        <a href="/portfolio">Open watch-only portfolio</a>
      </Reveal>,
    );
    // Even though the reveal has not fired, the content is present, in the
    // accessibility tree, and operable.
    const link = screen.getByRole("link", { name: /open watch-only portfolio/i });
    expect(link.getAttribute("href")).toBe("/portfolio");
  });

  it("keeps decorative motion classes without gating content behind them", () => {
    const { container } = render(
      <Reveal>
        <p>Body copy stays readable.</p>
      </Reveal>,
    );
    const wrapper = container.firstElementChild;
    // A decorative class may be present...
    expect(wrapper?.classList.contains("rise")).toBe(true);
    // ...but the content is not removed, hidden from AT, or otherwise gated.
    expect(wrapper?.getAttribute("aria-hidden")).toBeNull();
    expect(wrapper?.hasAttribute("hidden")).toBe(false);
    expect(screen.getByText(/body copy stays readable/i)).toBeTruthy();
  });
});
