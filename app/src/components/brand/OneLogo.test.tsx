// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { OneLogo } from "./OneLogo";

afterEach(cleanup);

describe("OneLogo", () => {
  it("renders the ONE wordmark and hides the decorative mark from assistive tech", () => {
    const { container } = render(<OneLogo />);
    expect(screen.getByText("ONE")).toBeTruthy();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("can render the mark alone, without the wordmark", () => {
    render(<OneLogo showWordmark={false} />);
    expect(screen.queryByText("ONE")).toBeNull();
  });
});
