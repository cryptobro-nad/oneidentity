// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const loadNftHoldingsAction = vi.fn();
vi.mock("@/app/nft-actions", () => ({
  loadNftHoldingsAction: (...a: unknown[]) => loadNftHoldingsAction(...a),
}));

import { NftHoldings } from "./NftHoldings";
import type { PortfolioAddress } from "@/lib/types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;

const collection = (over: Record<string, unknown>) => ({
  chainId: 143,
  contractAddress: "0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC",
  name: "Cool Collection",
  nameSource: "onchain",
  total: "5",
  perWallet: [
    { wallet: A, count: "2" },
    { wallet: B, count: "3" },
  ],
  partial: false,
  isErc721: true,
  ...over,
});

const okResult = (collections: unknown[]) => ({
  ok: true,
  collections,
  blockNumber: "88730274",
  discovery: { state: "complete", provider: "onchain-log-scan" },
  verificationPartial: false,
  candidatesConsidered: collections.length,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NftHoldings ownership table", () => {
  it("renders a collection × wallet matrix where combined equals the wallet columns", async () => {
    loadNftHoldingsAction.mockResolvedValue(okResult([collection({})]));
    render(<NftHoldings addresses={[A, B]} />);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Cool Collection")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /combined/i })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /wallet a/i })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /wallet b/i })).toBeTruthy();
    // Combined 5 = 2 + 3.
    expect(within(table).getByText("5")).toBeTruthy();
    expect(within(table).getByText("2")).toBeTruthy();
    expect(within(table).getByText("3")).toBeTruthy();
  });

  it("hides a collection with no verified holdings", async () => {
    loadNftHoldingsAction.mockResolvedValue(
      okResult([collection({ total: "0", perWallet: [{ wallet: A, count: "0" }, { wallet: B, count: "0" }] })]),
    );
    render(<NftHoldings addresses={[A, B]} />);
    await waitFor(() => expect(screen.getByText(/no nft collections with a verified holding/i)).toBeTruthy());
    expect(screen.queryByText("Cool Collection")).toBeNull();
  });

  it("sorts by combined count and reveals collections in bounded batches of 12", async () => {
    // 20 collections with descending counts (20, 19, … 1).
    const many = Array.from({ length: 20 }, (_, i) =>
      collection({
        name: `Col ${String(20 - i).padStart(2, "0")}`,
        contractAddress: `0x${(i + 1).toString(16).padStart(40, "0")}`,
        total: String(20 - i),
        perWallet: [{ wallet: A, count: String(20 - i) }, { wallet: B, count: "0" }],
      }),
    );
    loadNftHoldingsAction.mockResolvedValue(okResult(many));
    const user = userEvent.setup();
    render(<NftHoldings addresses={[A, B]} />);

    // Largest first, only 12 shown initially.
    await screen.findByText("Col 20");
    expect(screen.getByText("Col 09")).toBeTruthy(); // 12th (20..09)
    expect(screen.queryByText("Col 08")).toBeNull();

    await user.click(screen.getByRole("button", { name: /show more \(8 more\)/i }));
    expect(screen.getByText("Col 08")).toBeTruthy();
    expect(screen.getByText("Col 01")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /show fewer/i }));
    expect(screen.queryByText("Col 08")).toBeNull();
  });

  it("routes a lure-named collection into a collapsed Likely spam section", async () => {
    loadNftHoldingsAction.mockResolvedValue(
      okResult([
        collection({ name: "Real Collection", contractAddress: "0x1111111111111111111111111111111111111111" }),
        collection({ name: "EVMHUB VOUCHER", contractAddress: "0x2222222222222222222222222222222222222222" }),
      ]),
    );
    const user = userEvent.setup();
    render(<NftHoldings addresses={[A, B]} />);

    await screen.findByText("Real Collection");
    // Spam is collapsed by default.
    expect(screen.queryByText("EVMHUB VOUCHER")).toBeNull();
    await user.click(screen.getByRole("button", { name: /show likely spam \(1\)/i }));
    expect(screen.getByText("EVMHUB VOUCHER")).toBeTruthy();
  });
});
