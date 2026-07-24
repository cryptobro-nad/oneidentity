// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PortfolioResult } from "./PortfolioResult";
import { shortenAddress } from "@/lib/format";
import type { AggregatedPortfolio, AssetReadResult } from "@/lib/types";

afterEach(cleanup);

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as const;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as const;
const ok = (v: bigint): AssetReadResult => ({ success: true, rawValue: v });
const ONE_TOKEN = 10n ** 18n;

function portfolio(
  wallets: { address: `0x${string}`; mon: AssetReadResult; tokens: Record<string, AssetReadResult> }[],
): AggregatedPortfolio {
  const totals: Record<string, bigint> = { MON: 0n };
  for (const w of wallets) {
    if (w.mon.success && w.mon.rawValue !== undefined) totals.MON = totals.MON! + w.mon.rawValue;
    for (const [symbol, r] of Object.entries(w.tokens)) {
      if (r.success && r.rawValue !== undefined) totals[symbol] = (totals[symbol] ?? 0n) + r.rawValue;
    }
  }
  return {
    wallets,
    totals,
    blockNumber: 88_730_274n,
    partial: false,
    endpointUsed: "https://rpc.monad.xyz",
    failedEndpoints: [],
    fetchedAt: 1_760_000_000_000,
  };
}

// The portfolio uses a token × wallet ownership matrix: one row per token, a
// Combined column, and one column per wallet. These tests pin the contract that
// matters to users — every wallet has its own visible column and the combined
// value equals the sum of those columns, all in one scannable table.
describe("per-wallet ownership matrix", () => {
  const p = portfolio([
    { address: A, mon: ok(0n), tokens: { CHOG: ok(3n * ONE_TOKEN) } },
    { address: B, mon: ok(0n), tokens: { CHOG: ok(4n * ONE_TOKEN) } },
  ]);

  it("renders a Combined column and one column per wallet", () => {
    render(<PortfolioResult portfolio={p} />);
    expect(screen.getByRole("columnheader", { name: /combined/i })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /wallet a/i })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /wallet b/i })).toBeTruthy();
  });

  it("shows each wallet's own address in its column header", () => {
    render(<PortfolioResult portfolio={p} />);
    const headerA = screen.getByRole("columnheader", { name: /wallet a/i });
    const headerB = screen.getByRole("columnheader", { name: /wallet b/i });
    expect(within(headerA).getByText(shortenAddress(A))).toBeTruthy();
    expect(within(headerB).getByText(shortenAddress(B))).toBeTruthy();
  });

  it("makes the combined value equal the sum of the wallet columns", () => {
    render(<PortfolioResult portfolio={p} />);
    const table = screen.getByRole("table");
    // Combined 7, with 3 and 4 each visible in their wallet columns.
    expect(within(table).getByText("7")).toBeTruthy();
    expect(within(table).getByText("3")).toBeTruthy();
    expect(within(table).getByText("4")).toBeTruthy();
  });
});
