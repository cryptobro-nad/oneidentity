// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// The heavy client (wallet, viem, registry) is not under test here; the page's
// trust framing is. Stub it so the header renders in isolation.
vi.mock("./VerifiedClient", () => ({ VerifiedClient: () => null }));

import VerifiedPage, { metadata } from "./page";

afterEach(cleanup);

describe("Verified ONE page — trust framing", () => {
  it("is titled and headed as creating a Verified ONE", () => {
    render(<VerifiedPage />);
    expect(metadata.title).toMatch(/verified one/i);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/create a verified one/i);
  });

  it("states secondary wallets sign only and the primary submits one transaction", () => {
    const { container } = render(<VerifiedPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/secondary wallets sign only/i);
    expect(text).toMatch(/primary submits one transaction/i);
  });

  it("states no funds move, no token approvals, and no custody", () => {
    const { container } = render(<VerifiedPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/no funds move/i);
    expect(text).toMatch(/no token approvals/i);
    expect(text).toMatch(/never takes custody/i);
  });

  it("describes the secondary authorization as gasless", () => {
    const { container } = render(<VerifiedPage />);
    expect(container.textContent ?? "").toMatch(/gasless authorization/i);
  });
});
