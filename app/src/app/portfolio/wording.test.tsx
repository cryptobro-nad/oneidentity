// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/nft-actions", () => ({ loadNftHoldingsAction: vi.fn() }));
vi.mock("./actions", () => ({
  loadPortfolioAction: vi.fn(),
  checkCollectionAction: vi.fn(),
}));

import PortfolioPage, { metadata } from "./page";
import { NftCollectionChecker } from "@/components/NftCollectionChecker";
import { WalletList } from "@/components/WalletList";

afterEach(cleanup);

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as const;

describe("page title and framing", () => {
  it("is titled Watch-only portfolios", () => {
    render(<PortfolioPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Watch-only portfolios");
  });

  it("no longer calls itself Personal portfolio", () => {
    const { container } = render(<PortfolioPage />);
    expect(container.textContent).not.toMatch(/personal portfolio/i);
  });

  it("uses the new title in page metadata", () => {
    expect(metadata.title).toMatch(/watch-only portfolios/i);
  });

  it("explains one wallet and up to five", () => {
    render(<PortfolioPage />);
    const text = screen.getByRole("banner").textContent ?? document.body.textContent!;
    expect(text).toMatch(/single wallet|one wallet/i);
    expect(text).toMatch(/up to 5/i);
  });

  it("explains combined totals and a per-wallet breakdown", () => {
    const { container } = render(<PortfolioPage />);
    expect(container.textContent).toMatch(/combined totals/i);
    expect(container.textContent).toMatch(/per-wallet breakdown/i);
  });

  it("states no connection or signature is needed", () => {
    const { container } = render(<PortfolioPage />);
    expect(container.textContent).toMatch(/no wallet connection or signature/i);
  });

  it("states these are private watchlists that do not prove ownership", () => {
    const { container } = render(<PortfolioPage />);
    expect(container.textContent).toMatch(/private watchlists/i);
    expect(container.textContent).toMatch(/do not prove ownership/i);
  });
});

describe("wallet input", () => {
  const noop = () => {};

  it("is labelled as a wallet address", () => {
    render(
      <WalletList
        addresses={[]}
        onAdd={noop}
        onRemove={noop}
        onClear={noop}
        onLoad={noop}
        loading={false}
      />,
    );
    expect(screen.getByLabelText(/add wallet address/i)).toBeTruthy();
  });

  it("says wallet address in the placeholder, not just 0x…", () => {
    render(
      <WalletList
        addresses={[]}
        onAdd={noop}
        onRemove={noop}
        onClear={noop}
        onLoad={noop}
        loading={false}
      />,
    );
    const input = screen.getByLabelText(/add wallet address/i) as HTMLInputElement;
    expect(input.placeholder).toMatch(/wallet address/i);
  });

  it("keeps Add wallet as the primary action", () => {
    render(
      <WalletList
        addresses={[]}
        onAdd={noop}
        onRemove={noop}
        onClear={noop}
        onLoad={noop}
        loading={false}
      />,
    );
    expect(screen.getByRole("button", { name: /^add wallet$/i })).toBeTruthy();
  });

  it("communicates that loading reads full balances", () => {
    render(
      <WalletList
        addresses={[A]}
        onAdd={noop}
        onRemove={noop}
        onClear={noop}
        onLoad={noop}
        loading={false}
        loadLabel="Check wallet balances"
      />,
    );
    expect(screen.getByRole("button", { name: /check wallet balances/i })).toBeTruthy();
  });
});

describe("NFT collection checker", () => {
  function renderChecker() {
    return render(<NftCollectionChecker addresses={[A]} />);
  }

  it("is headed as an advanced, collection-specific tool", () => {
    renderChecker();
    expect(
      screen.getByRole("heading", {
        name: /advanced: check a specific nft collection/i,
      }),
    ).toBeTruthy();
  });

  it("says it expects a collection contract address", () => {
    const { container } = renderChecker();
    expect(container.textContent).toMatch(/erc-721 collection contract address/i);
  });

  it("states explicitly that it does not accept a wallet address", () => {
    const { container } = renderChecker();
    expect(container.textContent).toMatch(/does not accept a wallet address/i);
  });

  it("never claims to check a wallet", () => {
    const { container } = renderChecker();
    // It must not read as a second, competing wallet checker.
    expect(container.textContent).not.toMatch(/check (a |your )?wallet\b/i);
    expect(container.textContent).not.toMatch(/enter (a |your )?wallet address/i);
  });

  it("asks for a collection contract in the placeholder", () => {
    renderChecker();
    const input = screen.getByLabelText(/collection contract address/i) as HTMLInputElement;
    expect(input.placeholder).toMatch(/nft collection contract/i);
    expect(input.placeholder).not.toMatch(/^0x…$/);
  });

  it("marks itself optional and separate from the portfolio load", () => {
    const { container } = renderChecker();
    expect(container.textContent).toMatch(/optional/i);
  });
});
