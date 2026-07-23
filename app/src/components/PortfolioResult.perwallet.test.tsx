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

// The redesign replaces the wide per-wallet table (which forced horizontal
// scrolling on phones) with one card per wallet. These tests pin the contract
// that matters to users: each wallet remains an individually readable unit, and
// the combined view stays distinct from the per-wallet view.
describe("per-wallet breakdown as individual cards", () => {
  const p = portfolio([
    { address: A, mon: ok(0n), tokens: { CHOG: ok(3n * ONE_TOKEN) } },
    { address: B, mon: ok(0n), tokens: { CHOG: ok(4n * ONE_TOKEN) } },
  ]);

  it("renders one labelled group per wallet", () => {
    render(<PortfolioResult portfolio={p} />);
    expect(screen.getByRole("group", { name: /wallet a balances/i })).toBeTruthy();
    expect(screen.getByRole("group", { name: /wallet b balances/i })).toBeTruthy();
  });

  it("shows each wallet's own address inside its card", () => {
    render(<PortfolioResult portfolio={p} />);
    const cardA = screen.getByRole("group", { name: /wallet a balances/i });
    const cardB = screen.getByRole("group", { name: /wallet b balances/i });
    expect(within(cardA).getByText(shortenAddress(A))).toBeTruthy();
    expect(within(cardB).getByText(shortenAddress(B))).toBeTruthy();
  });

  it("keeps the combined view distinct from the per-wallet cards", () => {
    render(<PortfolioResult portfolio={p} />);
    // The combined total (3 + 4 = 7) lives only in the combined group...
    const combined = screen.getByRole("group", { name: /combined totals/i });
    expect(within(combined).getByText("7")).toBeTruthy();
    // ...while the individual amounts live in their own wallet cards.
    const cardA = screen.getByRole("group", { name: /wallet a balances/i });
    expect(within(cardA).getByText("3")).toBeTruthy();
    expect(within(combined).queryByText("3")).toBeNull();
  });
});
