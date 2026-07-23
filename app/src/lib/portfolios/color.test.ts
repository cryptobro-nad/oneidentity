import { describe, expect, it } from "vitest";
import { normaliseState } from "./storage";
import { DEFAULT_PORTFOLIO_COLOR, normalizePortfolioColor, PORTFOLIO_COLORS } from "./types";

describe("normalizePortfolioColor", () => {
  it("keeps every curated colour", () => {
    for (const c of PORTFOLIO_COLORS) {
      expect(normalizePortfolioColor(c)).toBe(c);
    }
  });

  it("falls back to green for missing or unknown values", () => {
    expect(DEFAULT_PORTFOLIO_COLOR).toBe("green");
    expect(normalizePortfolioColor(undefined)).toBe("green");
    expect(normalizePortfolioColor(null)).toBe("green");
    expect(normalizePortfolioColor("mauve")).toBe("green");
    expect(normalizePortfolioColor(42)).toBe("green");
  });
});

describe("portfolio colour — backward compatibility", () => {
  it("gives a pre-colour saved portfolio the default green, keeping its data", () => {
    // Exactly the shape older builds persisted: no `color` field.
    const state = normaliseState({
      version: 2,
      portfolios: [{ id: "p1", name: "Old portfolio", addresses: [] }],
      activeId: "p1",
    });
    const p = state.portfolios.find((x) => x.name === "Old portfolio")!;
    expect(p.color).toBe("green");
    expect(p.addresses).toEqual([]);
    expect(p.name).toBe("Old portfolio");
  });

  it("preserves a stored curated colour", () => {
    const state = normaliseState({
      version: 2,
      portfolios: [{ id: "p1", name: "Trading", addresses: [], color: "violet" }],
      activeId: "p1",
    });
    expect(state.portfolios.find((x) => x.name === "Trading")!.color).toBe("violet");
  });

  it("coerces a corrupted colour back to green without dropping the portfolio", () => {
    const state = normaliseState({
      version: 2,
      portfolios: [{ id: "p1", name: "Weird", addresses: [], color: "#ff0000" }],
      activeId: "p1",
    });
    const p = state.portfolios.find((x) => x.name === "Weird")!;
    expect(p.color).toBe("green");
    expect(p.name).toBe("Weird");
  });
});
