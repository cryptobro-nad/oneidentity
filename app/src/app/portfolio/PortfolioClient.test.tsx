// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Server actions are mocked; no live Monad RPC in the test suite.
const loadPortfolioAction = vi.fn();
vi.mock("./actions", () => ({
  loadPortfolioAction: (...a: unknown[]) => loadPortfolioAction(...a),
}));

const loadNftHoldingsAction = vi.fn();
vi.mock("@/app/nft-actions", () => ({
  loadNftHoldingsAction: (...a: unknown[]) => loadNftHoldingsAction(...a),
}));

const checkCollectionAction = vi.fn();
vi.mock("@/app/portfolio/actions", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    loadPortfolioAction: (...a: unknown[]) => loadPortfolioAction(...a),
    checkCollectionAction: (...a: unknown[]) => checkCollectionAction(...a),
  };
});

import { PortfolioClient } from "./PortfolioClient";
import { resetAddressStoreCache } from "@/lib/addressStore";
import { STORAGE_KEY } from "@/lib/storage";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873";
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1";

function seedStorage(addresses: string[] | null) {
  window.localStorage.clear();
  if (addresses) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  resetAddressStoreCache();
}

const portfolioResponse = {
  ok: true as const,
  data: {
    wallets: [
      { address: A, mon: { success: true, rawValue: "1000000000000000000" }, stablecoins: {} },
    ],
    totals: { MON: "1000000000000000000", USDC: "0", USDT0: "0", AUSD: "0" },
    blockNumber: "88730274",
    partial: false,
    endpointUsed: "https://rpc.monad.xyz",
    failedEndpoints: [],
    fetchedAt: 1_760_000_000_000,
  },
};

beforeEach(() => {
  loadPortfolioAction.mockResolvedValue(portfolioResponse);
  loadNftHoldingsAction.mockResolvedValue({
    ok: true,
    collections: [],
    blockNumber: "88730274",
    discovery: { state: "complete", provider: "onchain-log-scan" },
    verificationPartial: false,
    candidatesConsidered: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  seedStorage(null);
});

describe("returning user with saved addresses", () => {
  it("restores the saved wallet list", () => {
    seedStorage([A, B]);
    render(<PortfolioClient />);
    expect(screen.getByText(/2 of 5 added/i)).toBeTruthy();
  });

  it("shows the 'Saved portfolio found' notice", () => {
    seedStorage([A, B]);
    render(<PortfolioClient />);
    expect(screen.getByText(/saved portfolio found/i)).toBeTruthy();
  });

  it("includes the browser-only privacy note", () => {
    seedStorage([A]);
    render(<PortfolioClient />);
    expect(screen.getByText(/saved only in this browser/i)).toBeTruthy();
  });

  it("labels the button 'Load saved portfolio' before the first load", () => {
    seedStorage([A, B]);
    render(<PortfolioClient />);
    expect(screen.getByRole("button", { name: /load saved portfolio/i })).toBeTruthy();
  });

  it("does NOT fetch the portfolio automatically on mount", async () => {
    seedStorage([A, B]);
    render(<PortfolioClient />);

    // Give any stray effect a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(loadPortfolioAction).not.toHaveBeenCalled();
  });

  it("does NOT start NFT discovery automatically on mount", async () => {
    seedStorage([A, B]);
    render(<PortfolioClient />);

    await new Promise((r) => setTimeout(r, 50));
    // NFT discovery scans transfer history and is expensive; arriving on the
    // page must never trigger it.
    expect(loadNftHoldingsAction).not.toHaveBeenCalled();
  });

  it("shows no saved notice on a first visit", () => {
    seedStorage(null);
    render(<PortfolioClient />);
    expect(screen.queryByText(/saved portfolio found/i)).toBeNull();
  });
});

describe("explicit load", () => {
  it("fetches fresh data when Load saved portfolio is clicked", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(screen.getByRole("button", { name: /load saved portfolio/i }));

    await waitFor(() => expect(loadPortfolioAction).toHaveBeenCalledWith([A]));
  });

  it("starts NFT discovery only after an explicit load", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    expect(loadNftHoldingsAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /load saved portfolio/i }));

    await waitFor(() => expect(loadNftHoldingsAction).toHaveBeenCalled());
  });

  it("relabels the button 'Refresh portfolio' after a successful load", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(screen.getByRole("button", { name: /load saved portfolio/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /refresh portfolio/i })).toBeTruthy(),
    );
  });

  it("hides the saved notice once data has been requested", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(screen.getByRole("button", { name: /load saved portfolio/i }));
    await waitFor(() => expect(screen.queryByText(/saved portfolio found/i)).toBeNull());
  });

  it("surfaces a load failure without inventing balances", async () => {
    loadPortfolioAction.mockResolvedValue({ ok: false, error: "Monad unreachable" });
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(screen.getByRole("button", { name: /load saved portfolio/i }));
    expect(await screen.findByText(/monad unreachable/i)).toBeTruthy();
  });
});

describe("editing the wallet list", () => {
  it("adds a wallet", async () => {
    seedStorage(null);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.type(screen.getByLabelText(/monad wallet address/i), A);
    await user.click(screen.getByRole("button", { name: /add wallet/i }));

    await waitFor(() => expect(screen.getByText(/1 of 5 added/i)).toBeTruthy());
  });

  it("removes a wallet", async () => {
    seedStorage([A, B]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    const removeButtons = screen.getAllByRole("button", { name: /^Remove /i });
    await user.click(removeButtons[0]!);

    await waitFor(() => expect(screen.getByText(/1 of 5 added/i)).toBeTruthy());
  });

  it("Clear all empties the stored list", async () => {
    seedStorage([A, B]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(screen.getByRole("button", { name: /clear all/i }));

    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(screen.getByText(/0 of 5 added/i)).toBeTruthy();
  });

  it("persists ONLY addresses — never balances, NFTs or block numbers", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(screen.getByRole("button", { name: /load saved portfolio/i }));
    await waitFor(() => expect(loadPortfolioAction).toHaveBeenCalled());
    await waitFor(() => expect(loadNftHoldingsAction).toHaveBeenCalled());

    // After a full load, storage must still contain the address list alone.
    const raw = window.localStorage.getItem(STORAGE_KEY)!;
    expect(JSON.parse(raw)).toEqual([A]);
    for (const forbidden of ["1000000000000000000", "88730274", "MON", "USDC", "collections", "totals"]) {
      expect(raw).not.toContain(forbidden);
    }
    expect(Object.keys(window.localStorage)).toEqual([STORAGE_KEY]);
  });
});
