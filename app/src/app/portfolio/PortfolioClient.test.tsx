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
import { resetPortfolioStoreCache } from "@/lib/portfolios/store";
import { LEGACY_ADDRESSES_KEY, PORTFOLIOS_KEY } from "@/lib/portfolios/storage";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873";
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1";

function seedStorage(addresses: string[] | null) {
  window.localStorage.clear();
  if (addresses)
    window.localStorage.setItem(
      LEGACY_ADDRESSES_KEY,
      JSON.stringify(addresses),
    );
  resetPortfolioStoreCache();
}

const portfolioResponse = {
  ok: true as const,
  data: {
    wallets: [
      {
        address: A,
        mon: { success: true, rawValue: "1000000000000000000" },
        stablecoins: {},
      },
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
    expect(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    ).toBeTruthy();
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

    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );

    await waitFor(() => expect(loadPortfolioAction).toHaveBeenCalledWith([A]));
  });

  it("starts NFT discovery only after an explicit load", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    expect(loadNftHoldingsAction).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );

    await waitFor(() => expect(loadNftHoldingsAction).toHaveBeenCalled());
  });

  it("relabels the button 'Refresh portfolio' after a successful load", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /refresh portfolio/i }),
      ).toBeTruthy(),
    );
  });

  it("hides the saved notice once data has been requested", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/saved portfolio found/i)).toBeNull(),
    );
  });

  it("surfaces a load failure without inventing balances", async () => {
    loadPortfolioAction.mockResolvedValue({
      ok: false,
      error: "Monad unreachable",
    });
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );
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

    // Clear all empties the ACTIVE portfolio's addresses. The portfolio itself
    // still exists — deleting a portfolio is a separate, confirmed action.
    await waitFor(() => {
      const raw = window.localStorage.getItem(PORTFOLIOS_KEY);
      const parsed = JSON.parse(raw!) as {
        portfolios: { addresses: string[] }[];
      };
      expect(parsed.portfolios[0]!.addresses).toEqual([]);
    });
    expect(screen.getByText(/0 of 5 added/i)).toBeTruthy();
  });

  it("persists ONLY addresses — never balances, NFTs or block numbers", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );
    await waitFor(() => expect(loadPortfolioAction).toHaveBeenCalled());
    await waitFor(() => expect(loadNftHoldingsAction).toHaveBeenCalled());

    // After a full load, storage must still contain the address list alone.
    const raw = window.localStorage.getItem(PORTFOLIOS_KEY)!;
    expect(JSON.parse(raw).portfolios[0].addresses).toEqual([A]);
    for (const forbidden of [
      "1000000000000000000",
      "88730274",
      "MON",
      "USDC",
      "collections",
      "totals",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
    expect(Object.keys(window.localStorage)).toEqual([PORTFOLIOS_KEY]);
  });
});

describe("multiple portfolios", () => {
  async function createPortfolioNamed(
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ) {
    await user.click(screen.getByRole("button", { name: /new portfolio/i }));
    await user.type(screen.getByLabelText(/name for the new portfolio/i), name);
    await user.click(screen.getByRole("button", { name: /^create$/i }));
  }

  it("names the wallet section after the active portfolio", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    expect(
      screen.getByRole("heading", { name: /wallets in .*personal/i }),
    ).toBeTruthy();

    await createPortfolioNamed(user, "Trading");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /wallets in .*trading/i }),
      ).toBeTruthy(),
    );
  });

  it("starts a new portfolio empty, without touching the other one", async () => {
    seedStorage([A, B]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await createPortfolioNamed(user, "Trading");

    await waitFor(() => expect(screen.getByText(/0 of 5 added/i)).toBeTruthy());
    // Switch back: Personal is intact.
    await user.selectOptions(
      screen.getByRole("combobox", { name: /^portfolio$/i }),
      "personal",
    );
    await waitFor(() => expect(screen.getByText(/2 of 5 added/i)).toBeTruthy());
  });

  it("does NOT scan when a portfolio is created", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await createPortfolioNamed(user, "Trading");
    await new Promise((r) => setTimeout(r, 50));

    expect(loadPortfolioAction).not.toHaveBeenCalled();
    expect(loadNftHoldingsAction).not.toHaveBeenCalled();
  });

  it("does NOT scan when switching portfolios", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await createPortfolioNamed(user, "Trading");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /^portfolio$/i }),
      "personal",
    );
    await new Promise((r) => setTimeout(r, 50));

    // Switching is a local, free operation. Only an explicit Load may spend RPC.
    expect(loadPortfolioAction).not.toHaveBeenCalled();
    expect(loadNftHoldingsAction).not.toHaveBeenCalled();
  });

  it("never shows one portfolio's balances under another's name", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy(),
    );

    await createPortfolioNamed(user, "Trading");

    // The loaded result belonged to Personal; it must be gone immediately.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /wallets in .*trading/i }),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: /refresh portfolio/i }),
    ).toBeNull();
  });

  it("discards an in-flight response if the user switches mid-load", async () => {
    seedStorage([A]);
    let release: (v: unknown) => void = () => {};
    loadPortfolioAction.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );
    await createPortfolioNamed(user, "Trading");

    release(portfolioResponse);
    await new Promise((r) => setTimeout(r, 50));

    // Personal's data arrived after the switch and must not be rendered.
    expect(
      screen.queryByRole("button", { name: /refresh portfolio/i }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: /wallets in .*trading/i }),
    ).toBeTruthy();
  });

  it("clears a load error when switching away", async () => {
    loadPortfolioAction.mockResolvedValue({
      ok: false,
      error: "Monad unreachable",
    });
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await user.click(
      screen.getByRole("button", { name: /load saved portfolio/i }),
    );
    expect(await screen.findByText(/monad unreachable/i)).toBeTruthy();

    await createPortfolioNamed(user, "Trading");
    await waitFor(() =>
      expect(screen.queryByText(/monad unreachable/i)).toBeNull(),
    );
  });

  it("keeps each portfolio's addresses separate in storage", async () => {
    seedStorage([A]);
    const user = userEvent.setup();
    render(<PortfolioClient />);

    await createPortfolioNamed(user, "Trading");
    await user.type(screen.getByLabelText(/monad wallet address/i), B);
    await user.click(screen.getByRole("button", { name: /add wallet/i }));

    await waitFor(() => {
      const parsed = JSON.parse(
        window.localStorage.getItem(PORTFOLIOS_KEY)!,
      ) as {
        portfolios: { name: string; addresses: string[] }[];
      };
      expect(
        parsed.portfolios.find((p) => p.name === "Personal")!.addresses,
      ).toEqual([A]);
      expect(
        parsed.portfolios.find((p) => p.name === "Trading")!.addresses,
      ).toEqual([B]);
    });
  });
});
