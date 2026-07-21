/**
 * Tells a returning user their wallet list survived, and that nothing has been
 * fetched yet.
 *
 * The second half matters as much as the first: the page deliberately does not
 * load balances or start NFT discovery on arrival, so without this the list
 * would look stale or broken rather than simply un-loaded.
 *
 * Rendered as a compact strip integrated into the workspace surface rather than
 * a free-floating banner, so it reads as part of the current portfolio.
 */
export function SavedPortfolioNotice({ count }: { count: number }) {
  return (
    <div role="status" className="rounded-[10px] border border-line bg-raised px-4 py-3">
      <p className="text-sm leading-relaxed text-muted">
        <span className="font-medium text-ink">Saved portfolio found.</span> Your{" "}
        {count === 1 ? "wallet address is" : `${count} wallet addresses are`} saved in this browser.
        Load the portfolio to read fresh balances and NFT holdings.
      </p>
      <p className="mt-1.5 text-xs text-faint">
        Saved only in this browser. Clearing site data or using another browser removes this list.
        Balances and NFT results are never saved. ONE reads them from Monad each time.
      </p>
    </div>
  );
}
