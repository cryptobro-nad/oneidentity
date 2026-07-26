// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// The interactive panel (wallet, viem, server actions) is not under test here;
// the page's transfer-method framing is. Stub it so the header renders alone.
vi.mock("@/components/verified/VerifiedV2Panel", () => ({ VerifiedV2Panel: () => null }));

import VerifiedPage, { metadata } from "./page";

afterEach(cleanup);

describe("Verified ONE page — transfer-method framing", () => {
  it("is titled and headed as creating a Verified ONE", () => {
    render(<VerifiedPage />);
    expect(metadata.title).toMatch(/verified one/i);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/create a verified one/i);
  });

  it("frames linking as sending MON from the wallet being linked (transfer method)", () => {
    const { container } = render(<VerifiedPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/sending a small amount of MON/i);
    expect(text).toMatch(/never connects here/i);
    expect(text).toMatch(/never takes custody/i);
  });

  it("does not use the wallet-signing (V1) framing", () => {
    const { container } = render(<VerifiedPage />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("gasless authorization");
    expect(text).not.toContain("no funds move");
    expect(text).not.toContain("each secondary wallet signs");
  });
});
