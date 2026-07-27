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

import { getAddress } from "viem";
import { sanitizeAddressList, validateCollectionAddress } from "@/lib/addresses";
import { checkCollection } from "@/lib/nft";
import { loadPortfolioWithClient } from "@/lib/portfolio";
import { AllEndpointsFailedError, withRpcFallback } from "@/lib/rpc";
import { resolveDiscoveryProvider } from "@/lib/assets/config";
import { discoverAndVerifyAssets } from "@/lib/assets/discover";
import { createEnvioLogSource } from "@/lib/assets/envioClient";
import { CuratedAssetProvider } from "@/lib/assets/providers/curated";
import { EnvioHyperSyncProvider } from "@/lib/assets/providers/envioHyperSync";
import type { WireDiscoveredFungibles } from "@/lib/assets/display";
import type { AggregatedPortfolio, PortfolioAddress } from "@/lib/types";
import {
  encodeNftCheck,
  encodePortfolio,
  type ActionResult,
  type WireNftCheck,
  type WirePortfolio,
} from "@/lib/wire";

/** A portfolio response carrying the discovered fungible holdings alongside the
 *  native (MON) read. `discovered` is absent only in older/mocked responses. */
export type WirePortfolioWithDiscovery = WirePortfolio & {
  discovered?: WireDiscoveredFungibles;
};

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
): Promise<ActionResult<WirePortfolioWithDiscovery>> {
  const clean = sanitizeAddressList(addresses);
  if (clean.length === 0) {
    return { ok: false, error: "Add at least one valid wallet address." };
  }

  // Provider selection is server-only and defaults to curated, so an
  // unconfigured deployment shows exactly the known token set. The curated
  // provider never fails, so discovery always returns at least that coverage.
  const flag = resolveDiscoveryProvider();
  const curated = new CuratedAssetProvider();

  try {
    const envio = new EnvioHyperSyncProvider(await createEnvioLogSource());
    const walletList = clean.map((a) => getAddress(a) as PortfolioAddress);
    const outcome = await withRpcFallback(async (client) => {
      // One RPC endpoint serves both reads. Native MON comes from the existing
      // native balance read (empty token list); the fungible rows come from
      // discovery + on-chain verification.
      const [native, assets] = await Promise.all([
        loadPortfolioWithClient(client, walletList, []),
        discoverAndVerifyAssets(client, walletList, { flag, envio, curated }),
      ]);
      return { native, assets };
    });

    const { native, assets } = outcome.value;
    const aggregated: AggregatedPortfolio = {
      ...native,
      endpointUsed: outcome.endpointUsed,
      failedEndpoints: outcome.failedEndpoints,
      fetchedAt: Date.now(),
    };

    const discovered: WireDiscoveredFungibles = {
      tokens: assets.holdings.map((h) => ({ ...h, raw: h.raw.toString() })),
      failures: assets.failures,
      status: assets.status,
      source: assets.source,
      blockNumber: assets.block.toString(),
    };

    return { ok: true, data: { ...encodePortfolio(aggregated), discovered } };
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
