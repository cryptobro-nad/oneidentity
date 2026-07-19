// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioSwitcher } from "./PortfolioSwitcher";
import { MAX_NAME_LENGTH, PERSONAL_ID, type Portfolio } from "@/lib/portfolios/types";

afterEach(cleanup);

const PERSONAL: Portfolio = {
  id: PERSONAL_ID,
  name: "Personal",
  addresses: [],
};
const TRADING: Portfolio = {
  id: "p-trading",
  name: "Trading wallets",
  addresses: [
    "0xB09684f5486d1af80699BbC27f14dd5A905da873",
    "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1",
  ],
};

function setup(portfolios: Portfolio[] = [PERSONAL, TRADING], activeId: string = PERSONAL_ID) {
  const onSelect = vi.fn();
  const onCreate = vi.fn(() => ({ ok: true }));
  const onRename = vi.fn(() => ({ ok: true }));
  const onDelete = vi.fn();

  render(
    <PortfolioSwitcher
      portfolios={portfolios}
      activeId={activeId}
      onSelect={onSelect}
      onCreate={onCreate}
      onRename={onRename}
      onDelete={onDelete}
    />,
  );

  return { user: userEvent.setup(), onSelect, onCreate, onRename, onDelete };
}

/** The row element for a portfolio, by its visible name. */
function row(name: string): HTMLElement {
  return screen.getByText(name).closest("li")!;
}

describe("rows", () => {
  it("lists every portfolio with its wallet count", () => {
    setup();
    expect(within(row("Personal")).getByText(/0 wallets/i)).toBeTruthy();
    expect(within(row("Trading wallets")).getByText(/2 wallets/i)).toBeTruthy();
  });

  it("uses the singular for exactly one wallet", () => {
    setup([
      {
        id: "p1",
        name: "Solo",
        addresses: ["0xB09684f5486d1af80699BbC27f14dd5A905da873"],
      },
    ]);
    expect(within(row("Solo")).getByText("1 wallet")).toBeTruthy();
  });

  it("selects a portfolio when the row body is clicked", async () => {
    const { user, onSelect } = setup();
    await user.click(screen.getByText("Trading wallets"));
    expect(onSelect).toHaveBeenCalledWith(TRADING.id);
  });

  it("marks the active portfolio for both sighted and assistive users", () => {
    setup([PERSONAL, TRADING], TRADING.id);

    // Anchored: "Rename Trading wallets" and "Delete Trading wallets" also
    // contain the name, so only the row-body button starts with it.
    const active = within(row("Trading wallets")).getByRole("button", {
      name: /^Trading wallets/,
    });
    expect(active.getAttribute("aria-current")).toBe("true");
    expect(within(row("Trading wallets")).getByText(/selected/i)).toBeTruthy();

    const inactive = within(row("Personal")).getByRole("button", {
      name: /^Personal/,
    });
    expect(inactive.getAttribute("aria-current")).toBeNull();
  });

  it("does not nest the action buttons inside the select button", () => {
    // Nested interactive elements are invalid HTML and are exactly how an Edit
    // click ends up also firing selection.
    setup();
    const selectButton = within(row("Trading wallets")).getByRole("button", {
      name: /^Trading wallets/,
    });
    expect(within(selectButton).queryByRole("button")).toBeNull();
  });
});

describe("actions do not trigger selection", () => {
  it("Edit opens the rename form without selecting", async () => {
    const { user, onSelect } = setup();
    await user.click(within(row("Trading wallets")).getByRole("button", { name: /rename/i }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/new name for/i)).toBeTruthy();
  });

  it("Delete opens the confirmation without selecting", async () => {
    const { user, onSelect, onDelete } = setup();
    await user.click(within(row("Trading wallets")).getByRole("button", { name: /delete/i }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("acts on the row's own portfolio, not the active one", async () => {
    // Personal is active; editing the Trading row must target Trading.
    const { user, onRename } = setup([PERSONAL, TRADING], PERSONAL_ID);
    await user.click(within(row("Trading wallets")).getByRole("button", { name: /rename/i }));

    const input = screen.getByLabelText(/new name for/i);
    await user.clear(input);
    await user.type(input, "Hot wallets");
    await user.click(screen.getByRole("button", { name: /save name/i }));

    expect(onRename).toHaveBeenCalledWith(TRADING.id, "Hot wallets");
  });
});

describe("the default portfolio", () => {
  it("can be renamed", async () => {
    const { user, onRename } = setup();
    await user.click(within(row("Personal")).getByRole("button", { name: /rename/i }));

    const input = screen.getByLabelText(/new name for/i);
    await user.clear(input);
    await user.type(input, "Main");
    await user.click(screen.getByRole("button", { name: /save name/i }));

    expect(onRename).toHaveBeenCalledWith(PERSONAL_ID, "Main");
  });

  it("offers no Delete action", () => {
    setup();
    expect(within(row("Personal")).queryByRole("button", { name: /delete/i })).toBeNull();
    // …while a custom portfolio does.
    expect(within(row("Trading wallets")).getByRole("button", { name: /delete/i })).toBeTruthy();
  });

  it("keeps its Delete hidden even after being renamed", () => {
    setup([{ ...PERSONAL, name: "Main" }, TRADING], PERSONAL_ID);
    expect(within(row("Main")).queryByRole("button", { name: /delete/i })).toBeNull();
    expect(within(row("Main")).getByRole("button", { name: /rename/i })).toBeTruthy();
  });
});

describe("creating", () => {
  it("submits a new name", async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    await user.type(screen.getByLabelText(/name for the new portfolio/i), "Team treasury");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(onCreate).toHaveBeenCalledWith("Team treasury");
  });

  it("caps the input at the name length limit", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    expect(
      (screen.getByLabelText(/name for the new portfolio/i) as HTMLInputElement).maxLength,
    ).toBe(MAX_NAME_LENGTH);
  });

  it("shows the rejection message and keeps the form open", async () => {
    const onCreate = vi.fn(() => ({
      ok: false,
      message: "That name is already used.",
    }));
    render(
      <PortfolioSwitcher
        portfolios={[PERSONAL]}
        activeId={PERSONAL_ID}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn(() => ({ ok: true }))}
        onDelete={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    await user.type(screen.getByLabelText(/name for the new portfolio/i), "Personal");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(screen.getByRole("alert").textContent).toMatch(/already used/i);
    expect(screen.getByLabelText(/name for the new portfolio/i)).toBeTruthy();
  });

  it("moves focus into the name field when the form opens", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    expect(document.activeElement).toBe(screen.getByLabelText(/name for the new portfolio/i));
  });

  it("closes on cancel without calling onCreate", async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/name for the new portfolio/i)).toBeNull();
  });
});

describe("deleting", () => {
  it("names the portfolio in the confirmation and waits", async () => {
    const { user, onDelete } = setup();
    await user.click(within(row("Trading wallets")).getByRole("button", { name: /delete/i }));

    expect(screen.getByRole("alertdialog").textContent).toContain("Trading wallets");
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes only after confirmation", async () => {
    const { user, onDelete } = setup();
    await user.click(within(row("Trading wallets")).getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /delete portfolio$/i }));

    expect(onDelete).toHaveBeenCalledWith(TRADING.id);
  });

  it("cancels cleanly", async () => {
    const { user, onDelete } = setup();
    await user.click(within(row("Trading wallets")).getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /keep it/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("explains the deletion is local and does not affect a ONE", async () => {
    const { user } = setup();
    await user.click(within(row("Trading wallets")).getByRole("button", { name: /delete/i }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/does not affect .*verified one/i);
  });
});

describe("privacy copy", () => {
  it("states that portfolios are browser-local and not onchain", () => {
    setup();
    const note = screen.getByText(/private watchlists saved in this browser/i);
    expect(note.textContent).toMatch(/not stored onchain/i);
    expect(note.textContent).toMatch(/do not prove wallet ownership/i);
  });
});

describe("narrow screens and long names", () => {
  it("uses a stacking list, not horizontally scrolling tabs", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `p-${i}`,
      name: `Portfolio number ${i} with a fairly long name`,
      addresses: [],
    }));
    setup([PERSONAL, ...many]);

    expect(screen.getAllByRole("listitem")).toHaveLength(13);
    expect(screen.queryByRole("tablist")).toBeNull();
    // A dropdown would hide the wallet counts the design calls for.
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("truncates a long name instead of pushing the actions off screen", () => {
    const long: Portfolio = {
      id: "p-long",
      name: "x".repeat(MAX_NAME_LENGTH),
      addresses: [],
    };
    setup([PERSONAL, long], long.id);

    const label = screen.getByText("x".repeat(MAX_NAME_LENGTH));
    expect(label.className).toContain("truncate");
    // The row body may shrink; the action cluster may not.
    const selectButton = within(row("x".repeat(MAX_NAME_LENGTH))).getByRole("button", {
      name: new RegExp("^x{10}"),
    });
    expect(selectButton.className).toContain("min-w-0");
  });

  it("lets rows wrap rather than overflow", () => {
    setup();
    expect(row("Trading wallets").className).toContain("flex-wrap");
  });
});
