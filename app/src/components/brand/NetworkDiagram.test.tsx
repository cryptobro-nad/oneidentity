// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { NetworkDiagram } from "./NetworkDiagram";

afterEach(cleanup);

describe("NetworkDiagram", () => {
  it("exposes the diagram to assistive tech with a meaningful label", () => {
    render(<NetworkDiagram />);
    const img = screen.getByRole("img");
    const label = img.getAttribute("aria-label") ?? "";
    // A real, descriptive label — not empty, not a filename.
    expect(label.length).toBeGreaterThan(10);
    expect(label).toMatch(/wallets?.*combined view/i);
  });

  it("draws exactly four animated pulse paths", () => {
    const { container } = render(<NetworkDiagram />);
    const pulses = container.querySelectorAll(".strand-pulse");
    expect(pulses.length).toBe(4);
  });

  it("normalizes every pulse path with pathLength=100", () => {
    const { container } = render(<NetworkDiagram />);
    const pulses = Array.from(container.querySelectorAll(".strand-pulse"));
    expect(pulses).toHaveLength(4);
    for (const p of pulses) {
      expect(p.getAttribute("pathLength")).toBe("100");
    }
  });

  it("labels one primary wallet and two secondary wallets", () => {
    const { container } = render(<NetworkDiagram />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/PRIMARY/);
    // Two secondary sources flank the primary.
    const secondaryCount = (text.match(/SECONDARY/g) ?? []).length;
    expect(secondaryCount).toBe(2);
  });

  it("does not describe the combined view as a Verified identity", () => {
    const { container } = render(<NetworkDiagram />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    const text = container.textContent ?? "";
    // The combined watch-only view must not be presented as a Verified ONE.
    expect(text).not.toMatch(/verified/i);
    expect(label).not.toMatch(/verified/i);
    // The accurate framing is still present.
    expect(text).toMatch(/combined view/i);
  });
});
