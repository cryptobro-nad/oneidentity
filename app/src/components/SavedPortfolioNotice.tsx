import { Notice } from "./ui/Notice";

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
    <Notice tone="info" role="status" title="Saved portfolio found">
      <p className="leading-relaxed">
        Your {count === 1 ? "wallet address is" : `${count} wallet addresses are`} saved in this
        browser. Load the portfolio to read fresh balances and NFT holdings.
      </p>
      <p className="mt-2 text-xs text-faint">
        Saved only in this browser. Clearing site data or using another browser removes this list.
        Balances and NFT results are never saved. ONE reads them from Monad each time.
      </p>
    </Notice>
  );
}
