// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { SigningStep } from "./SigningStep";
import { ReviewStep } from "./ReviewStep";
import { ActiveOneCard } from "./ActiveOneCard";
import type { OneDraft } from "@/lib/registry/draft";
import type { MembershipActionResult } from "@/app/verified/actions";
import type { PortfolioAddress } from "@/lib/types";

afterEach(cleanup);

const A = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;
const B = "0xe3A0795381521C177fc8c7723213df7B56A10a31" as PortfolioAddress;
const ONE = "0x1139dec3A681C96807D8C277601655A707494AaA" as PortfolioAddress;

const draft: OneDraft = {
  members: [A, B],
  primary: A, // A is primary, so B is the secondary that signs
  salt: "0x01",
  deadline: String(Math.floor(Date.now() / 1000) + 3600),
  signatures: [],
  createdAt: Date.now(),
};

describe("SigningStep — gasless, secondary-only signatures", () => {
  const renderStep = () =>
    render(
      <SigningStep
        draft={draft}
        connectedAddress={null}
        isOnMonad={false}
        signing={null}
        onSign={() => {}}
        error={null}
      />,
    );

  it("explains that secondaries sign gasless and the primary does not sign", () => {
    const { container } = renderStep();
    const text = container.textContent ?? "";
    expect(text).toMatch(/gasless authorization/i);
    expect(text).toMatch(/primary wallet\s+does not sign/i);
    expect(text).toMatch(/submitting the transaction/i);
  });

  it("states signing moves no funds and approves no tokens, with no custody", () => {
    const { container } = renderStep();
    const text = container.textContent ?? "";
    expect(text).toMatch(/does not move funds or approve tokens/i);
    expect(text).toMatch(/never takes custody/i);
  });

  it("shows an unsigned secondary as not yet signed", () => {
    renderStep();
    expect(screen.getByText(/not signed yet/i)).toBeTruthy();
  });
});

describe("ReviewStep — one primary transaction, no assets move", () => {
  const renderStep = () =>
    render(
      <ReviewStep
        primary={A}
        sortedMembers={[A, B]}
        predictedAddress={null}
        deadline={null}
        gasPlan={null}
        bufferPercent={15}
        onBufferChange={() => {}}
        issues={[]}
        simulating={false}
        canSubmit={false}
        submitting={false}
        onSimulate={() => {}}
        onSubmit={() => {}}
        error={null}
      />,
    );

  it("states the primary submits one transaction and no assets move", () => {
    const { container } = renderStep();
    const text = container.textContent ?? "";
    expect(text).toMatch(/primary wallet submits one transaction/i);
    expect(text).toMatch(/no assets move/i);
  });

  it("labels the primary and secondary roles in the review", () => {
    renderStep();
    expect(screen.getByText("PRIMARY")).toBeTruthy();
    expect(screen.getByText("SECONDARY")).toBeTruthy();
  });

  it("offers the create action, disabled until requirements are met", () => {
    renderStep();
    const create = screen.getByRole("button", { name: /create verified one/i }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
  });
});

describe("ActiveOneCard — the ONE identity address is not a wallet", () => {
  const linked = {
    state: "linked",
    oneAddress: ONE,
    role: "primary",
    isActive: true,
    memberCount: 2,
  } as Extract<MembershipActionResult, { state: "linked" }>;

  it("warns that the identity address is not a wallet and must not receive funds", () => {
    render(<ActiveOneCard membership={linked} connectedAddress={A} />);
    expect(screen.getByText(/identity address, not a wallet/i)).toBeTruthy();
    expect(screen.getByText(/do not send funds to it/i)).toBeTruthy();
  });

  it("still links to the real public profile", () => {
    render(<ActiveOneCard membership={linked} connectedAddress={A} />);
    expect(screen.getByRole("link", { name: /view my one/i }).getAttribute("href")).toBe(
      `/one/${ONE}`,
    );
  });
});
