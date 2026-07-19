/**
 * Tells a returning user their wallet list survived, and that nothing has been
 * fetched yet.
 *
 * The second half matters as much as the first: the page deliberately does not
 * load balances or start NFT discovery on arrival, so without this the list
 * would look stale or broken rather than simply un-loaded.
 */
export function SavedPortfolioNotice({ count }: { count: number }) {
  return (
    <div role="status" className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3.5 sm:px-5">
      <p className="text-sm font-medium text-ink">Saved portfolio found</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Your {count === 1 ? "wallet address is" : `${count} wallet addresses are`} saved in this
        browser. Load the portfolio to fetch fresh onchain balances and NFT holdings.
      </p>
      <p className="mt-2 text-xs text-faint">
        Saved only in this browser. Clearing site data or using another browser removes this list.
        Balances and NFT results are never saved — they are always re-read from Monad.
      </p>
    </div>
  );
}
