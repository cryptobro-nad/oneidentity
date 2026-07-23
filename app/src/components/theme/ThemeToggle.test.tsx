// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("labels the action for the current theme and toggles + persists on click", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const user = userEvent.setup();
    render(<ThemeToggle />);

    // After mount it reflects the current (dark) theme; the label is the action.
    const toLight = await screen.findByRole("button", { name: /switch to light theme/i });
    await user.click(toLight);

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("one-theme")).toBe("light");
    // The label now offers the reverse action.
    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeTruthy();
  });

  it("switches back to dark and persists that too", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const toDark = await screen.findByRole("button", { name: /switch to dark theme/i });
    await user.click(toDark);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("one-theme")).toBe("dark");
  });
});
