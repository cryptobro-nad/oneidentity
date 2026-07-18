"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { NftCollectionChecker } from "@/components/NftCollectionChecker";
import { ErrorNotice, UnverifiedNotice } from "@/components/Notices";
import { PortfolioResult } from "@/components/PortfolioResult";
import { WalletList } from "@/components/WalletList";
import { removeAddress } from "@/lib/addresses";
import {
  getServerSnapshot,
  getSnapshot,
  setAddresses,
  subscribe,
} from "@/lib/addressStore";
import type { AggregatedPortfolio, PortfolioAddress } from "@/lib/types";
import { decodePortfolio } from "@/lib/wire";
import { loadPortfolioAction } from "./actions";

export function PortfolioClient() {
  // The address list lives in localStorage, which is external to React and
  // absent during SSR — useSyncExternalStore is the supported way to read it
  // without an effect that would cause a cascading render.
  const addresses = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [portfolio, setPortfolio] = useState<AggregatedPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const add = useCallback(
    (address: PortfolioAddress) => {
      setAddresses([...getSnapshot(), address]);
    },
    [],
  );

  const remove = useCallback((address: PortfolioAddress) => {
    setAddresses(removeAddress(getSnapshot(), address));
    // A result that no longer matches the wallet list would be misleading.
    setPortfolio(null);
  }, []);

  const clear = useCallback(() => {
    setAddresses([]);
    setPortfolio(null);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  return (
    <div className="space-y-12">
      <UnverifiedNotice />

      <WalletList
        addresses={addresses}
        onAdd={add}
        onRemove={remove}
        onClear={clear}
        onLoad={load}
        loading={loading}
      />

      {error ? <ErrorNotice title="Could not load the portfolio">{error}</ErrorNotice> : null}

      {portfolio ? (
        <div className="border-t border-line pt-12">
          <PortfolioResult portfolio={portfolio} />
        </div>
      ) : null}

      <div className="border-t border-line pt-12">
        <NftCollectionChecker addresses={addresses} />
      </div>
    </div>
  );
}
