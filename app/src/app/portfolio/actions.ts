"use server";

/**
 * Server Actions for the portfolio.
 *
 * RPC calls run on the server so the browser never talks to a Monad node
 * directly — that avoids CORS entirely and keeps endpoint choice in one place.
 * These are read-only: they take addresses, return balances, and touch nothing.
 *
 * Addresses are re-validated here. A Server Action is a public POST endpoint,
 * so client-side validation cannot be trusted on its own.
 */

import { sanitizeAddressList, validateCollectionAddress } from "@/lib/addresses";
import { checkCollection } from "@/lib/nft";
import { loadPortfolio } from "@/lib/portfolio";
import { AllEndpointsFailedError } from "@/lib/rpc";
import {
  encodeNftCheck,
  encodePortfolio,
  type ActionResult,
  type WireNftCheck,
  type WirePortfolio,
} from "@/lib/wire";

function describeFailure(err: unknown): string {
  if (err instanceof AllEndpointsFailedError) {
    return (
      "Could not reach Monad Mainnet. Both the primary and fallback RPC endpoints failed: " +
      err.failures.map((f) => `${f.url} (${f.error})`).join("; ")
    );
  }
  return err instanceof Error ? err.message : "Unexpected error loading data.";
}

export async function loadPortfolioAction(
  addresses: string[],
): Promise<ActionResult<WirePortfolio>> {
  const clean = sanitizeAddressList(addresses);
  if (clean.length === 0) {
    return { ok: false, error: "Add at least one valid wallet address." };
  }

  try {
    const portfolio = await loadPortfolio(clean);
    return { ok: true, data: encodePortfolio(portfolio) };
  } catch (err) {
    return { ok: false, error: describeFailure(err) };
  }
}

export async function checkCollectionAction(
  collectionInput: string,
  addresses: string[],
): Promise<ActionResult<WireNftCheck>> {
  const collection = validateCollectionAddress(collectionInput);
  if (!collection.ok) return { ok: false, error: collection.message };

  const clean = sanitizeAddressList(addresses);
  if (clean.length === 0) {
    return { ok: false, error: "Add at least one wallet address before checking a collection." };
  }

  try {
    const result = await checkCollection(collection.address, clean);
    return { ok: true, data: encodeNftCheck(result) };
  } catch (err) {
    return { ok: false, error: describeFailure(err) };
  }
}
