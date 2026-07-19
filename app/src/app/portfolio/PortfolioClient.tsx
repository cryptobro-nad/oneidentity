"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { NftCollectionChecker } from "@/components/NftCollectionChecker";
import { NftHoldings } from "@/components/NftHoldings";
import { ErrorNotice, UnverifiedNotice } from "@/components/Notices";
import { PortfolioResult } from "@/components/PortfolioResult";
import { SavedPortfolioNotice } from "@/components/SavedPortfolioNotice";
import { WalletList } from "@/components/WalletList";
import { removeAddress } from "@/lib/addresses";
import {
  getServerSnapshot,
  getSnapshot,
  setAddresses,
  subscribe,
  wasRestoredFromStorage,
} from "@/lib/addressStore";
import type { AggregatedPortfolio, PortfolioAddress } from "@/lib/types";
import { decodePortfolio } from "@/lib/wire";
import { loadPortfolioAction } from "./actions";

export function PortfolioClient() {
  // The address list lives in localStorage, which is external to React and
  // absent during SSR — useSyncExternalStore is the supported way to read it
  // without an effect that would cause a cascading render.
  const addresses = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const restoredFromStorage = useSyncExternalStore(
    subscribe,
    wasRestoredFromStorage,
    () => false,
  );

  const [portfolio, setPortfolio] = useState<AggregatedPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Whether the user has explicitly asked for data this session.
   *
   * Nothing fetches until this is true. A returning user with five saved
   * wallets would otherwise trigger a portfolio read *and* a full NFT
   * transfer-history scan just by opening the page — many RPC calls and
   * several seconds of work nobody asked for.
   */
  const [dataRequested, setDataRequested] = useState(false);

  const add = useCallback((address: PortfolioAddress) => {
    setAddresses([...getSnapshot(), address]);
  }, []);

  const remove = useCallback((address: PortfolioAddress) => {
    setAddresses(removeAddress(getSnapshot(), address));
    // A result that no longer matches the wallet list would be misleading.
    setPortfolio(null);
    setDataRequested(false);
  }, []);

  const clear = useCallback(() => {
    setAddresses([]);
    setPortfolio(null);
    setError(null);
    setDataRequested(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDataRequested(true);
    try {
      const response = await loadPortfolioAction(addresses);
      if (response.ok) {
        setPortfolio(decodePortfolio(response.data));
      } else {
        setPortfolio(null);
        setError(response.error);
      }
    } catch {
      setPortfolio(null);
      setError("The portfolio request failed unexpectedly. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [addresses]);

  // Saved addresses are only news before the first load of this session.
  const showSavedNotice = restoredFromStorage && !dataRequested && addresses.length > 0;

  return (
    <div className="space-y-12">
      <UnverifiedNotice />

      {showSavedNotice ? <SavedPortfolioNotice count={addresses.length} /> : null}

      <WalletList
        addresses={addresses}
        onAdd={add}
        onRemove={remove}
        onClear={clear}
        onLoad={load}
        loading={loading}
        loadLabel={
          portfolio ? "Refresh portfolio" : showSavedNotice ? "Load saved portfolio" : "Load portfolio"
        }
      />

      {error ? <ErrorNotice title="Could not load the portfolio">{error}</ErrorNotice> : null}

      {portfolio ? (
        <div className="border-t border-line pt-12">
          <PortfolioResult portfolio={portfolio} />
        </div>
      ) : null}

      {/* NFT discovery is gated on the same explicit request. Mounting this
          component starts a transfer-history scan, so it must not appear
          merely because saved addresses exist. */}
      {dataRequested && addresses.length > 0 ? (
        <div className="border-t border-line pt-12">
          <NftHoldings addresses={addresses} />
        </div>
      ) : null}

      <div className="border-t border-line pt-12">
        <NftCollectionChecker addresses={addresses} />
      </div>
    </div>
  );
}
