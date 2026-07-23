"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { NftCollectionChecker } from "@/components/NftCollectionChecker";
import { NftHoldings } from "@/components/NftHoldings";
import { ErrorNotice, UnverifiedNotice } from "@/components/Notices";
import { PortfolioResult } from "@/components/PortfolioResult";
import { PortfolioSwitcher } from "@/components/PortfolioSwitcher";
import { SavedPortfolioNotice } from "@/components/SavedPortfolioNotice";
import { WalletList } from "@/components/WalletList";
import {
  addAddressTo,
  clearAddressesIn,
  createPortfolio,
  deletePortfolio,
  getServerSnapshot,
  getSnapshot,
  removeAddressFrom,
  renamePortfolio,
  setActivePortfolio,
  setPortfolioColor,
  subscribe,
} from "@/lib/portfolios/store";
import { activePortfolio, type PortfolioColor } from "@/lib/portfolios/types";
import type { AggregatedPortfolio, PortfolioAddress } from "@/lib/types";
import { decodePortfolio } from "@/lib/wire";
import { loadPortfolioAction } from "./actions";

export function PortfolioClient() {
  // Portfolios live in localStorage — external to React and absent during SSR,
  // so useSyncExternalStore is the supported way to read them without an
  // effect that would cause a cascading render.
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const active = activePortfolio(state);
  const addresses = active.addresses;

  const [result, setResult] = useState<AggregatedPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Which portfolio the current result and NFT scan belong to.
   *
   * This is what prevents cross-portfolio leakage. Results are rendered only
   * when this matches the active portfolio, so switching can never show one
   * portfolio's balances under another's name — even for the render between a
   * switch and any cleanup.
   */
  const [resultsFor, setResultsFor] = useState<string | null>(null);

  const resultsMatchActive = resultsFor === active.id;
  const shownResult = resultsMatchActive ? result : null;
  const dataRequested = resultsMatchActive && resultsFor !== null;

  const clearResults = useCallback(() => {
    setResult(null);
    setResultsFor(null);
    setError(null);
  }, []);

  // --- portfolio management -------------------------------------------------

  const selectPortfolio = useCallback(
    (id: string) => {
      setActivePortfolio(id);
      // Results belong to the portfolio they were loaded for.
      clearResults();
    },
    [clearResults],
  );

  const handleCreate = useCallback(
    (name: string) => {
      const outcome = createPortfolio(name);
      if (outcome.ok) clearResults();
      return {
        ok: outcome.ok,
        message: outcome.ok ? undefined : outcome.message,
        // The new id lets the switcher apply the chosen colour without changing
        // the create signature the existing tests rely on.
        id: outcome.ok ? outcome.id : undefined,
      };
    },
    [clearResults],
  );

  const handleRename = useCallback((id: string, name: string) => {
    const outcome = renamePortfolio(id, name);
    // A rename keeps the same id and addresses, so results stay valid.
    return {
      ok: outcome.ok,
      message: outcome.ok ? undefined : outcome.message,
    };
  }, []);

  // Colour is a visual aid only; setting it never touches addresses or results.
  const handleSetColor = useCallback((id: string, color: PortfolioColor) => {
    setPortfolioColor(id, color);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      deletePortfolio(id);
      clearResults();
    },
    [clearResults],
  );

  // --- addresses ------------------------------------------------------------

  const add = useCallback(
    (address: PortfolioAddress) => {
      addAddressTo(active.id, address);
    },
    [active.id],
  );

  const remove = useCallback(
    (address: PortfolioAddress) => {
      removeAddressFrom(active.id, address);
      // A result that no longer matches the wallet list would be misleading.
      clearResults();
    },
    [active.id, clearResults],
  );

  const clear = useCallback(() => {
    clearAddressesIn(active.id);
    clearResults();
  }, [active.id, clearResults]);

  // --- loading --------------------------------------------------------------

  const load = useCallback(async () => {
    const portfolioId = active.id;
    setLoading(true);
    setError(null);
    try {
      const response = await loadPortfolioAction(addresses);
      // Guard against a switch mid-request: results are only accepted for the
      // portfolio that is still active.
      if (getSnapshot().activeId !== portfolioId) return;

      if (response.ok) {
        setResult(decodePortfolio(response.data));
        setResultsFor(portfolioId);
      } else {
        setResult(null);
        setResultsFor(portfolioId);
        setError(response.error);
      }
    } catch {
      setResult(null);
      setResultsFor(portfolioId);
      setError("The portfolio request failed unexpectedly. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [active.id, addresses]);

  const savedFromPreviousVisit = !dataRequested && addresses.length > 0;

  return (
    <div className="space-y-8">
      <UnverifiedNotice />

      {/* One workspace surface: portfolio selection, selected state and wallet
          count, add-wallet input, wallet list and actions live together as
          zones separated by dividers, not as separate stacked cards. */}
      <div className="card divide-y divide-line overflow-hidden">
        <PortfolioSwitcher
          portfolios={state.portfolios}
          activeId={active.id}
          onSelect={selectPortfolio}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDelete}
          onColorChange={handleSetColor}
        />

        <div className="space-y-5 p-5 sm:p-6">
          {savedFromPreviousVisit ? <SavedPortfolioNotice count={addresses.length} /> : null}

          <WalletList
            addresses={addresses}
            onAdd={add}
            onRemove={remove}
            onClear={clear}
            onLoad={load}
            loading={loading}
            heading={`Wallets in “${active.name}”`}
            loadLabel={
              shownResult
                ? "Refresh portfolio"
                : savedFromPreviousVisit
                  ? "Load saved portfolio"
                  : // One wallet is not a "portfolio" in the user's head, so name
                    // the action after what it actually does in that case.
                    addresses.length === 1
                    ? "Check wallet balances"
                    : "Load portfolio"
            }
          />
        </div>
      </div>

      {error && resultsMatchActive ? (
        <ErrorNotice title="Could not load the portfolio">{error}</ErrorNotice>
      ) : null}

      {shownResult ? (
        <div className="border-t border-line pt-8">
          <PortfolioResult portfolio={shownResult} />
        </div>
      ) : null}

      {/* NFT discovery is gated on the same explicit request, and keyed to the
          active portfolio so switching cannot start a scan or show stale rows. */}
      {dataRequested && addresses.length > 0 ? (
        <div className="border-t border-line pt-8">
          <NftHoldings key={active.id} addresses={addresses} />
        </div>
      ) : null}

      {/* Advanced NFT checker: kept visible and functional, framed as a quiet
          secondary tool (faint fill, no depth). The component is shared with the
          public profile and is not modified. */}
      <div className="border-t border-line pt-8">
        <div className="rounded-[16px] border border-line bg-surface-2/40 p-5 sm:p-6">
          <NftCollectionChecker key={active.id} addresses={addresses} />
        </div>
      </div>
    </div>
  );
}
