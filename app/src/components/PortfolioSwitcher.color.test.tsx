// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioSwitcher } from "./PortfolioSwitcher";
import { PERSONAL_ID, type Portfolio } from "@/lib/portfolios/types";

afterEach(cleanup);

const GREEN: Portfolio = { id: PERSONAL_ID, name: "Green one", addresses: [], color: "green" };
const LEGACY: Portfolio = { id: "p-none", name: "Legacy", addresses: [] }; // no colour field
const VIOLET: Portfolio = { id: "p-violet", name: "Violet one", addresses: [], color: "violet" };

function setup(portfolios: Portfolio[], activeId: string = PERSONAL_ID) {
  const onColorChange = vi.fn();
  const onCreate = vi.fn(() => ({ ok: true, id: "new-id" }));
  const onRename = vi.fn(() => ({ ok: true }));
  render(
    <PortfolioSwitcher
      portfolios={portfolios}
      activeId={activeId}
      onSelect={vi.fn()}
      onCreate={onCreate}
      onRename={onRename}
      onDelete={vi.fn()}
      onColorChange={onColorChange}
    />,
  );
  return { user: userEvent.setup(), onColorChange, onCreate, onRename };
}

const row = (name: string) => screen.getByText(name).closest("li")!;

describe("PortfolioSwitcher — colour accents", () => {
  it("renders each portfolio's chosen accent, defaulting old ones to green", () => {
    setup([GREEN, VIOLET, LEGACY]);
    expect(row("Green one").getAttribute("data-portfolio-color")).toBe("green");
    expect(row("Violet one").getAttribute("data-portfolio-color")).toBe("violet");
    // A portfolio saved before colours existed still renders — as green.
    expect(row("Legacy").getAttribute("data-portfolio-color")).toBe("green");
  });

  it("applies a colour chosen while creating a portfolio", async () => {
    const { user, onColorChange, onCreate } = setup([GREEN]);
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    await user.type(screen.getByLabelText(/name for the new portfolio/i), "Team");
    await user.click(screen.getByRole("radio", { name: "Blue" }));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    // Name-only create signature is unchanged; the colour is applied to the new id.
    expect(onCreate).toHaveBeenCalledWith("Team");
    expect(onColorChange).toHaveBeenCalledWith("new-id", "blue");
  });

  it("changes the colour when editing", async () => {
    const { user, onColorChange, onRename } = setup([GREEN]);
    await user.click(within(row("Green one")).getByRole("button", { name: /rename/i }));
    // The current colour is pre-selected in the palette.
    expect(screen.getByRole("radio", { name: "Green" }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("radio", { name: "Rose" }));
    await user.click(screen.getByRole("button", { name: /save name/i }));

    expect(onRename).toHaveBeenCalledWith(PERSONAL_ID, "Green one");
    expect(onColorChange).toHaveBeenCalledWith(PERSONAL_ID, "rose");
  });

  it("marks the editing portfolio's current colour in the palette", async () => {
    const { user } = setup([GREEN, VIOLET], "p-violet");
    await user.click(within(row("Violet one")).getByRole("button", { name: /rename/i }));
    expect(screen.getByRole("radio", { name: "Violet" }).getAttribute("aria-checked")).toBe("true");
  });

  it("does not use colour as the only selected-state indicator", () => {
    // Two portfolios share a colour; only one is active.
    const otherViolet: Portfolio = { id: "p-v2", name: "Violet two", addresses: [], color: "violet" };
    setup([VIOLET, otherViolet], "p-violet");

    // Same accent on both rows...
    expect(row("Violet one").getAttribute("data-portfolio-color")).toBe("violet");
    expect(row("Violet two").getAttribute("data-portfolio-color")).toBe("violet");

    // ...but selection is carried by the badge + aria-current, not the colour.
    expect(within(row("Violet one")).getByText(/selected/i)).toBeTruthy();
    expect(
      within(row("Violet one")).getByRole("button", { name: /^Violet one/ }).getAttribute("aria-current"),
    ).toBe("true");
    expect(within(row("Violet two")).queryByText(/selected/i)).toBeNull();
    expect(
      within(row("Violet two")).getByRole("button", { name: /^Violet two/ }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
