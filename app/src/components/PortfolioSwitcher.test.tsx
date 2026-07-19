// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioSwitcher } from "./PortfolioSwitcher";
import {
  PERSONAL_ID,
  MAX_NAME_LENGTH,
  type Portfolio,
} from "@/lib/portfolios/types";

afterEach(cleanup);

const PERSONAL: Portfolio = {
  id: PERSONAL_ID,
  name: "Personal",
  addresses: [],
};
const TRADING: Portfolio = {
  id: "p-trading",
  name: "Trading wallets",
  addresses: ["0xB09684f5486d1af80699BbC27f14dd5A905da873"],
};

function setup(
  portfolios: Portfolio[] = [PERSONAL, TRADING],
  activeId: string = PERSONAL_ID,
) {
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

describe("selecting", () => {
  it("lists every portfolio", () => {
    setup();
    const select = screen.getByRole("combobox", { name: /^portfolio$/i });
    expect(
      within(select).getByRole("option", { name: /Personal/ }),
    ).toBeTruthy();
    expect(
      within(select).getByRole("option", { name: /Trading wallets/ }),
    ).toBeTruthy();
  });

  it("shows the wallet count next to a non-empty portfolio", () => {
    setup();
    expect(
      screen.getByRole("option", { name: /Trading wallets \(1\)/ }),
    ).toBeTruthy();
  });

  it("reports the selection upward", async () => {
    const { user, onSelect } = setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /^portfolio$/i }),
      TRADING.id,
    );
    expect(onSelect).toHaveBeenCalledWith(TRADING.id);
  });

  it("reflects the active portfolio as the current value", () => {
    setup([PERSONAL, TRADING], TRADING.id);
    expect(
      (
        screen.getByRole("combobox", {
          name: /^portfolio$/i,
        }) as HTMLSelectElement
      ).value,
    ).toBe(TRADING.id);
  });
});

describe("creating", () => {
  it("submits a new name", async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    await user.type(
      screen.getByLabelText(/name for the new portfolio/i),
      "Team treasury",
    );
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(onCreate).toHaveBeenCalledWith("Team treasury");
  });

  it("caps the input at the name length limit", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    const input = screen.getByLabelText(
      /name for the new portfolio/i,
    ) as HTMLInputElement;
    expect(input.maxLength).toBe(MAX_NAME_LENGTH);
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
    await user.type(
      screen.getByLabelText(/name for the new portfolio/i),
      "Personal",
    );
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(screen.getByRole("alert").textContent).toMatch(/already used/i);
    expect(screen.getByLabelText(/name for the new portfolio/i)).toBeTruthy();
  });

  it("closes on cancel without calling onCreate", async () => {
    const { user, onCreate } = setup();
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/name for the new portfolio/i)).toBeNull();
  });

  it("moves focus into the name field when the form opens", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    expect(document.activeElement).toBe(
      screen.getByLabelText(/name for the new portfolio/i),
    );
  });
});

describe("renaming", () => {
  it("offers no rename or delete for Personal", () => {
    setup([PERSONAL, TRADING], PERSONAL_ID);
    expect(screen.queryByRole("button", { name: /rename/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("prefills the current name", async () => {
    const { user } = setup([PERSONAL, TRADING], TRADING.id);
    await user.click(screen.getByRole("button", { name: /rename portfolio/i }));
    expect(
      (screen.getByLabelText(/new name for/i) as HTMLInputElement).value,
    ).toBe(TRADING.name);
  });

  it("submits the edited name for the active portfolio", async () => {
    const { user, onRename } = setup([PERSONAL, TRADING], TRADING.id);
    await user.click(screen.getByRole("button", { name: /rename portfolio/i }));

    const input = screen.getByLabelText(/new name for/i);
    await user.clear(input);
    await user.type(input, "Hot wallets");
    await user.click(screen.getByRole("button", { name: /save name/i }));

    expect(onRename).toHaveBeenCalledWith(TRADING.id, "Hot wallets");
  });
});

describe("deleting", () => {
  it("asks for confirmation naming the portfolio, and does not delete yet", async () => {
    const { user, onDelete } = setup([PERSONAL, TRADING], TRADING.id);
    await user.click(screen.getByRole("button", { name: /delete portfolio/i }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Trading wallets");
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes only after confirmation", async () => {
    const { user, onDelete } = setup([PERSONAL, TRADING], TRADING.id);
    await user.click(screen.getByRole("button", { name: /delete portfolio/i }));
    await user.click(
      screen.getByRole("button", { name: /delete portfolio$/i }),
    );

    expect(onDelete).toHaveBeenCalledWith(TRADING.id);
  });

  it("cancels cleanly", async () => {
    const { user, onDelete } = setup([PERSONAL, TRADING], TRADING.id);
    await user.click(screen.getByRole("button", { name: /delete portfolio/i }));
    await user.click(screen.getByRole("button", { name: /keep it/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("explains that deleting is local and does not affect a ONE", async () => {
    const { user } = setup([PERSONAL, TRADING], TRADING.id);
    await user.click(screen.getByRole("button", { name: /delete portfolio/i }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(
      /does not affect .*verified one/i,
    );
  });
});

describe("privacy copy", () => {
  it("states that portfolios are browser-local and not onchain", () => {
    setup();
    const section = screen.getByText(
      /private watchlists saved in this browser/i,
    );
    expect(section.textContent).toMatch(/not stored onchain/i);
    expect(section.textContent).toMatch(/do not prove wallet ownership/i);
  });
});

describe("narrow screens", () => {
  it("uses a select rather than a tab row, so many portfolios cannot overflow", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `p-${i}`,
      name: `Portfolio number ${i} with a fairly long name`,
      addresses: [],
    }));
    setup([PERSONAL, ...many]);

    expect(screen.getByRole("combobox", { name: /^portfolio$/i }).tagName).toBe(
      "SELECT",
    );
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("lets controls wrap instead of forcing horizontal scroll", async () => {
    const { user } = setup([PERSONAL, TRADING], TRADING.id);
    const buttonRow = screen.getByRole("button", {
      name: /new portfolio/i,
    }).parentElement!;
    expect(buttonRow.className).toContain("flex-wrap");

    // The create form stacks vertically below the `sm` breakpoint.
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    const field = screen.getByLabelText(
      /name for the new portfolio/i,
    ).parentElement!;
    expect(field.className).toContain("flex-col");
    expect(field.className).toContain("sm:flex-row");
  });

  it("truncates a long name in the closed select without breaking layout", () => {
    const long: Portfolio = {
      id: "p-long",
      name: "x".repeat(40),
      addresses: [],
    };
    setup([PERSONAL, long], long.id);

    const select = screen.getByRole("combobox", { name: /^portfolio$/i });
    expect(select.className).toContain("truncate");
    expect(select.className).toContain("max-w-full");
    // The untruncated name is still exposed via the option text.
    expect(screen.getByRole("option", { name: "x".repeat(40) })).toBeTruthy();
  });
});
