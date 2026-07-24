// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PortfolioResult } from "./PortfolioResult";
import type { AggregatedPortfolio, AssetReadResult } from "@/lib/types";

afterEach(cleanup);

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as const;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as const;

const ok = (v: bigint): AssetReadResult => ({ success: true, rawValue: v });
const failed = (e = "execution reverted"): AssetReadResult => ({
  success: false,
  error: e,
});

/** Builds a portfolio, computing totals from the per-wallet reads. */
function portfolio(
  wallets: {
    address: `0x${string}`;
    mon: AssetReadResult;
    tokens: Record<string, AssetReadResult>;
  }[],
): AggregatedPortfolio {
  const totals: Record<string, bigint> = { MON: 0n };
  let partial = false;

  for (const w of wallets) {
    if (w.mon.success && w.mon.rawValue !== undefined) totals.MON = totals.MON! + w.mon.rawValue;
    else partial = true;
    for (const [symbol, r] of Object.entries(w.tokens)) {
      if (r.success && r.rawValue !== undefined)
        totals[symbol] = (totals[symbol] ?? 0n) + r.rawValue;
      else partial = true;
    }
  }

  return {
    wallets,
    totals,
    blockNumber: 88_730_274n,
    partial,
    endpointUsed: "https://rpc.monad.xyz",
    failedEndpoints: [],
    fetchedAt: 1_760_000_000_000,
  };
}

const ONE_TOKEN = 10n ** 18n;

/** The ownership matrix table (token rows × wallet columns). */
function totalsGrid(): HTMLElement {
  return screen.getByRole("table");
}

describe("hiding zero balances", () => {
  it("always shows MON, even at zero", () => {
    render(<PortfolioResult portfolio={portfolio([{ address: A, mon: ok(0n), tokens: {} }])} />);
    expect(within(totalsGrid()).getByText("MON")).toBeTruthy();
  });

  it("hides a zero-balance stablecoin", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(ONE_TOKEN), tokens: { USDC: ok(0n) } }])}
      />,
    );
    expect(within(totalsGrid()).queryByText("USDC")).toBeNull();
  });

  it("hides a zero-balance meme token", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(ONE_TOKEN), tokens: { CHOG: ok(0n) } }])}
      />,
    );
    expect(within(totalsGrid()).queryByText("CHOG")).toBeNull();
  });

  it("shows a held meme token", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(0n), tokens: { CHOG: ok(5n * ONE_TOKEN) } }])}
      />,
    );
    expect(within(totalsGrid()).getByText("CHOG")).toBeTruthy();
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });

  it("offers no control to reveal zero-balance assets", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(0n), tokens: { CHOG: ok(ONE_TOKEN) } }])}
      />,
    );
    // The Show/Hide zero-balances toggle and the hidden-count message are gone.
    expect(screen.queryByRole("button", { name: /zero balances/i })).toBeNull();
    expect(screen.queryByText(/zero balance hidden/i)).toBeNull();
  });
});

describe("failed reads are never hidden as zero", () => {
  it("keeps a failed token visible even though its total is zero", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(ONE_TOKEN), tokens: { CHOG: failed() } }])}
      />,
    );
    // Hiding this would present an RPC failure as "you hold none".
    expect(within(totalsGrid()).getByText("CHOG")).toBeTruthy();
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
  });

  it("marks the total incomplete rather than authoritative", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([
          { address: A, mon: ok(ONE_TOKEN), tokens: { CHOG: ok(ONE_TOKEN) } },
          { address: B, mon: ok(ONE_TOKEN), tokens: { CHOG: failed() } },
        ])}
      />,
    );
    expect(within(totalsGrid()).getByText(/incomplete/i)).toBeTruthy();
  });

  it("one failed token does not hide or break the others", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([
          {
            address: A,
            mon: ok(ONE_TOKEN),
            tokens: {
              CHOG: failed(),
              JAMES: ok(7n * ONE_TOKEN),
              USDC: ok(1_000_000n),
            },
          },
        ])}
      />,
    );
    const grid = totalsGrid();
    expect(within(grid).getByText("CHOG")).toBeTruthy();
    expect(within(grid).getByText("JAMES")).toBeTruthy();
    expect(within(grid).getByText("USDC")).toBeTruthy();
  });
});

describe("amounts", () => {
  it("sums a token across wallets", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([
          { address: A, mon: ok(0n), tokens: { CHOG: ok(3n * ONE_TOKEN) } },
          { address: B, mon: ok(0n), tokens: { CHOG: ok(4n * ONE_TOKEN) } },
        ])}
      />,
    );
    // 3 + 4 = 7 combined, with 3 and 4 still visible per wallet.
    expect(within(totalsGrid()).getByText("7")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("gives a single wallet the same treatment, total equalling its balance", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(0n), tokens: { CHOG: ok(42n * ONE_TOKEN) } }])}
      />,
    );
    // Combined column and the single wallet column both read 42.
    expect(within(totalsGrid()).getAllByText("42").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("columnheader", { name: /combined/i })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /wallet a/i })).toBeTruthy();
  });

  it("never renders a tiny non-zero balance as 0", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(0n), tokens: { CHOG: ok(1n) } }])}
      />,
    );
    // 1 wei of an 18-decimal token: shown as a bound, never as "0".
    expect(screen.getAllByText(/^< 0\.0+1$/).length).toBeGreaterThan(0);
    expect(within(totalsGrid()).getByText("CHOG")).toBeTruthy();
  });

  it("formats 6-decimal and 18-decimal tokens correctly side by side", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([
          {
            address: A,
            mon: ok(0n),
            // 2.5 USDC (6dp) and 2.5 CHOG (18dp) must both read "2.5".
            tokens: { USDC: ok(2_500_000n), CHOG: ok(25n * 10n ** 17n) },
          },
        ])}
      />,
    );
    expect(screen.getAllByText("2.5").length).toBeGreaterThanOrEqual(2);
  });
});

describe("token explanation", () => {
  it("shows only the subtle verified-onchain / held-only line", () => {
    render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(0n), tokens: { CHOG: ok(ONE_TOKEN) } }])}
      />,
    );
    expect(screen.getByText(/balances are verified onchain\. only held assets are shown\./i)).toBeTruthy();
    // No extra token-list or endorsement explanations in this section.
    expect(screen.queryByText(/inclusion is not an endorsement/i)).toBeNull();
    expect(screen.queryByText(/maintained monad token list/i)).toBeNull();
  });

  it("makes no price or market claim anywhere", () => {
    const { container } = render(
      <PortfolioResult
        portfolio={portfolio([{ address: A, mon: ok(ONE_TOKEN), tokens: { CHOG: ok(ONE_TOKEN) } }])}
      />,
    );
    const text = container.textContent!.toLowerCase();
    for (const banned of ["$", "usd value", "market cap", "price", "24h", "chart"]) {
      expect(text).not.toContain(banned);
    }
  });
});
