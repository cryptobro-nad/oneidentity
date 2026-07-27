// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const loadPortfolioAction = vi.fn();
vi.mock("./actions", () => ({
  loadPortfolioAction: (...a: unknown[]) => loadPortfolioAction(...a),
  checkCollectionAction: vi.fn(),
}));
const loadNftHoldingsAction = vi.fn();
vi.mock("@/app/nft-actions", () => ({
  loadNftHoldingsAction: (...a: unknown[]) => loadNftHoldingsAction(...a),
}));

import { PortfolioClient } from "./PortfolioClient";
import { resetPortfolioStoreCache } from "@/lib/portfolios/store";
import { LEGACY_ADDRESSES_KEY } from "@/lib/portfolios/storage";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873";
const REC = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function seed(addresses: string[]) {
  window.localStorage.clear();
  window.localStorage.setItem(LEGACY_ADDRESSES_KEY, JSON.stringify(addresses));
  resetPortfolioStoreCache();
}

const withDiscovery = {
  ok: true as const,
  data: {
    wallets: [{ address: A, mon: { success: true, rawValue: "1000000000000000000" }, tokens: {} }],
    totals: { MON: "1000000000000000000" },
    blockNumber: "88730274",
    partial: false,
    endpointUsed: "https://rpc.monad.xyz",
    failedEndpoints: [],
    fetchedAt: 1_760_000_000_000,
    discovered: {
      tokens: [
        { chainId: 143, wallet: A, contractAddress: REC, standard: "erc20", raw: "5000000000000000000", decimals: 18, symbol: "USDC", name: "USD Coin", metadataQuality: "onchain", classification: "recognized", verification: "curated-allowlist", discoverySource: "curated", incomplete: false },
        { chainId: 143, wallet: A, contractAddress: OTHER, standard: "erc20", raw: "3000000000000000000", decimals: 18, symbol: "WOW", name: "Wow Token", metadataQuality: "onchain", classification: "other", verification: "unknown", discoverySource: "envio", incomplete: false },
      ],
      failures: [],
      status: "complete",
      source: "envio",
      blockNumber: "88730274",
    },
  },
};

beforeEach(() => {
  loadPortfolioAction.mockResolvedValue(withDiscovery);
  loadNftHoldingsAction.mockResolvedValue({
    ok: true, collections: [], blockNumber: "88730274",
    discovery: { state: "complete", provider: "onchain-log-scan" }, verificationPartial: false, candidatesConsidered: 0,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  resetPortfolioStoreCache();
});

describe("PortfolioClient renders discovered fungibles after a load", () => {
  it("shows the Recognized/Other grouping from the discovery response", async () => {
    seed([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(screen.getByRole("button", { name: /load saved portfolio/i }));

    await waitFor(() => expect(screen.getByText("Recognized")).toBeTruthy());
    expect(screen.getByText("USDC")).toBeTruthy();
    expect(screen.getByText("Other tokens")).toBeTruthy();
    expect(screen.getByText("WOW")).toBeTruthy();
    expect(screen.getByText("MON")).toBeTruthy();
  });
});
