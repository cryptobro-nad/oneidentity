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
  subscribe,
} from "@/lib/portfolios/store";
import { activePortfolio } from "@/lib/portfolios/types";
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
      return { ok: outcome.ok, message: outcome.ok ? undefined : outcome.message };
    },
    [clearResults],
  );

  const handleRename = useCallback((id: string, name: string) => {
    const outcome = renamePortfolio(id, name);
    // A rename keeps the same id and addresses, so results stay valid.
    return { ok: outcome.ok, message: outcome.ok ? undefined : outcome.message };
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
    <div className="space-y-10">
      <UnverifiedNotice />

      <PortfolioSwitcher
        portfolios={state.portfolios}
        activeId={active.id}
        onSelect={selectPortfolio}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
      />

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
              : "Load portfolio"
        }
      />

      {error && resultsMatchActive ? (
        <ErrorNotice title="Could not load the portfolio">{error}</ErrorNotice>
      ) : null}

      {shownResult ? (
        <div className="border-t border-line pt-10">
          <PortfolioResult portfolio={shownResult} />
        </div>
      ) : null}

      {/* NFT discovery is gated on the same explicit request, and keyed to the
          active portfolio so switching cannot start a scan or show stale rows. */}
      {dataRequested && addresses.length > 0 ? (
        <div className="border-t border-line pt-10">
          <NftHoldings key={active.id} addresses={addresses} />
        </div>
      ) : null}

      <div className="border-t border-line pt-10">
        <NftCollectionChecker key={active.id} addresses={addresses} />
      </div>
    </div>
  );
}
