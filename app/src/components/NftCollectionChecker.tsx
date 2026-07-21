"use client";

import { useState, type FormEvent } from "react";
import { checkCollectionAction } from "@/app/portfolio/actions";
import { validateCollectionAddress } from "@/lib/addresses";
import {
  formatBlockNumber,
  formatCount,
  formatTimestamp,
  pluralise,
  walletLabel,
} from "@/lib/format";
import { decodeNftCheck } from "@/lib/wire";
import type { NftCollectionCheck, PortfolioAddress } from "@/lib/types";
import { AddressChip } from "./AddressChip";
import { ErrorNotice } from "./Notices";

/**
 * User-entered ERC-721 collection balance check.
 *
 * No name, image or token-ID lookup — the mainnet data spike found no
 * affordable, reliable indexer for that on Monad, so ONE asks for the
 * collection rather than guessing it.
 */
export function NftCollectionChecker({ addresses }: { addresses: PortfolioAddress[] }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NftCollectionCheck | null>(null);
  const [loading, setLoading] = useState(false);

  const disabled = addresses.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateCollectionAddress(draft);
    if (!validation.ok) {
      setError(validation.message);
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await checkCollectionAction(validation.address, addresses);
      if (response.ok) setResult(decodeNftCheck(response.data));
      else setError(response.error);
    } catch {
      setError("The collection check failed unexpectedly. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="nft-heading" className="space-y-5">
      <div>
        <h2 id="nft-heading" className="text-xl font-semibold tracking-[-0.01em] text-ink">
          Advanced: Check a specific NFT collection
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Enter an ERC-721 collection contract address to check how many NFTs from that collection
          are held by the wallets in this portfolio. This field does not accept a wallet address.
        </p>
        <p className="mt-1.5 text-sm text-faint">
          Optional. It is separate from loading the portfolio, and ONE does not browse or list your
          NFTs.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="0x… NFT collection contract"
            spellCheck={false}
            autoComplete="off"
            disabled={disabled}
            aria-label="ERC-721 collection contract address"
            className="min-w-0 flex-1 rounded-[8px] border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || loading}
            className="rounded-[8px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Checking…" : "Check combined holdings"}
          </button>
        </div>
        {disabled ? <p className="text-sm text-faint">Add at least one wallet first.</p> : null}
      </form>

      {error ? <ErrorNotice title="Could not check that collection">{error}</ErrorNotice> : null}

      {result?.status === "not-a-contract" ? (
        <ErrorNotice title="This address could not be checked as an ERC-721 collection.">
          There is no contract deployed at {shorten(result.address)} on Monad Mainnet.
        </ErrorNotice>
      ) : null}

      {result?.status === "not-erc721" ? (
        <ErrorNotice title="This address could not be checked as an ERC-721 collection.">
          A contract exists at {shorten(result.address)}, but it did not answer{" "}
          <code className="font-mono text-xs">balanceOf(address)</code>. ERC-1155 collections are
          not supported.
        </ErrorNotice>
      ) : null}

      {result?.status === "ok" ? (
        <div className="space-y-4 rounded-[12px] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-xs tracking-wide text-faint uppercase">Combined holdings</p>
              <p className="tnum mt-1.5 text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
                {formatCount(result.total)}{" "}
                <span className="text-lg font-normal text-muted">
                  {pluralise(result.total, "NFT")}
                </span>
              </p>
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-faint">
              <div className="flex gap-1.5">
                <dt>Block</dt>
                <dd className="tnum text-muted">{formatBlockNumber(result.blockNumber)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Checked</dt>
                <dd className="text-muted">{formatTimestamp(result.checkedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="flex items-center gap-2 border-t border-line pt-3 text-xs text-faint">
            <span>Collection</span>
            <AddressChip address={result.address} />
          </div>

          {result.partial ? (
            <p className="rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-muted">
              <span className="font-medium text-ink">Partial data loaded</span> — some wallets could
              not be read. They are excluded from the total rather than counted as zero.
            </p>
          ) : null}

          <ul className="divide-y divide-line">
            {result.wallets.map((wallet, index) => (
              <li key={wallet.address} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-[4.5rem] shrink-0 text-xs text-faint">
                    {walletLabel(index)}
                  </span>
                  <AddressChip address={wallet.address} />
                </div>
                {wallet.result.success ? (
                  <span
                    className={`tnum text-sm ${
                      (wallet.result.rawValue ?? 0n) === 0n ? "text-faint" : "text-ink"
                    }`}
                  >
                    {formatCount(wallet.result.rawValue ?? 0n)}
                  </span>
                ) : (
                  <span className="tnum text-sm text-danger" title={wallet.result.error}>
                    Failed
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
