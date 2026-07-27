// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioResult } from "./PortfolioResult";
import type { WireDiscoveredFungibles, WireFungibleHolding } from "@/lib/assets/display";
import type { AggregatedPortfolio, AssetReadResult } from "@/lib/types";

afterEach(cleanup);

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as const;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as const;
const REC = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const SPAM = "0x3333333333333333333333333333333333333333";
const E18 = 10n ** 18n;
const ok = (v: bigint): AssetReadResult => ({ success: true, rawValue: v });
const fail = (e: string): AssetReadResult => ({ success: false, error: e });

function portfolio(mon: { address: `0x${string}`; mon: AssetReadResult }[]): AggregatedPortfolio {
  const total = mon.reduce((s, w) => (w.mon.success ? s + (w.mon.rawValue ?? 0n) : s), 0n);
  return {
    wallets: mon.map((w) => ({ address: w.address, mon: w.mon, tokens: {} })),
    totals: { MON: total },
    blockNumber: 88_730_274n,
    partial: false,
    endpointUsed: "https://rpc.monad.xyz",
    failedEndpoints: [],
    fetchedAt: 1_760_000_000_000,
  };
}

const tok = (o: Partial<WireFungibleHolding> & { wallet: string; contractAddress: string; raw: string }): WireFungibleHolding => ({
  chainId: 143, standard: "erc20", decimals: 18, symbol: "TKN", name: "Token",
  metadataQuality: "onchain", classification: "other", verification: "unknown",
  discoverySource: "envio", incomplete: false, ...o,
});

function discovered(o: Partial<WireDiscoveredFungibles> = {}): WireDiscoveredFungibles {
  return { tokens: [], failures: [], status: "complete", source: "curated", blockNumber: "88730274", ...o };
}

describe("PortfolioResult — discovered fungibles", () => {
  const p = portfolio([{ address: A, mon: ok(2n * E18) }, { address: B, mon: ok(0n) }]);

  it("keeps native MON first, in the Recognized group", () => {
    render(<PortfolioResult portfolio={p} discovered={discovered({ tokens: [] })} />);
    expect(screen.getByText("Recognized")).toBeTruthy();
    expect(screen.getByText("MON")).toBeTruthy();
    // Combined MON = 2, shown once in the recognized table.
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("2").length).toBeGreaterThan(0);
  });

  it("groups a curated token as Recognized and an unknown token as Other", () => {
    render(
      <PortfolioResult
        portfolio={p}
        discovered={discovered({
          tokens: [
            tok({ wallet: A, contractAddress: REC, raw: (5n * E18).toString(), symbol: "USDC", name: "USD Coin", classification: "recognized" }),
            tok({ wallet: A, contractAddress: OTHER, raw: (3n * E18).toString(), symbol: "WOW", name: "Wow Token" }),
          ],
        })}
      />,
    );
    expect(screen.getByText("USDC")).toBeTruthy();
    expect(screen.getByText("Other tokens")).toBeTruthy();
    expect(screen.getByText("WOW")).toBeTruthy();
  });

  it("hides lure-named tokens behind a Likely spam toggle, expandable on demand", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioResult
        portfolio={p}
        discovered={discovered({
          tokens: [tok({ wallet: A, contractAddress: SPAM, raw: "1", symbol: "RWD", name: "Claim at reward.xyz" })],
        })}
      />,
    );
    // Collapsed by default.
    expect(screen.queryByText("RWD")).toBeNull();
    const toggle = screen.getByRole("button", { name: /show likely spam \(1\)/i });
    await user.click(toggle);
    expect(screen.getByText("RWD")).toBeTruthy();
  });

  it("shows a failed read as Failed, never as a zero balance", () => {
    render(
      <PortfolioResult
        portfolio={p}
        discovered={discovered({
          status: "partial",
          tokens: [tok({ wallet: A, contractAddress: OTHER, raw: (9n * E18).toString(), symbol: "WOW" })],
          failures: [{ scope: "contract", wallet: B, contract: OTHER, reason: "execution reverted", blocked: false }],
        })}
      />,
    );
    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("shows the curated-fallback notice only when dynamic discovery was attempted and failed", () => {
    render(
      <PortfolioResult
        portfolio={p}
        discovered={discovered({
          status: "partial",
          source: "curated",
          failures: [{ scope: "provider", reason: 'Discovery provider "envio" unavailable; using curated fallback.', blocked: false }],
        })}
      />,
    );
    expect(screen.getByText(/showing known tokens only/i)).toBeTruthy();
  });

  it("shows NO fallback notice for a plain curated deployment", () => {
    render(<PortfolioResult portfolio={p} discovered={discovered({ source: "curated", failures: [] })} />);
    expect(screen.queryByText(/showing known tokens only/i)).toBeNull();
  });

  it("still renders MON even when a wallet's native read failed (incomplete, not zero)", () => {
    const pf = portfolio([{ address: A, mon: ok(1n * E18) }, { address: B, mon: fail("reverted") }]);
    render(<PortfolioResult portfolio={pf} discovered={discovered()} />);
    expect(screen.getByText("MON")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText(/incomplete/i)).toBeTruthy();
  });
});
