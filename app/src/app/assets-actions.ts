"use server";

/**
 * Dynamic asset-discovery server action (Stage 2: fungibles).
 *
 * Read-only. Chooses the discovery provider from the server flag, discovers
 * candidate ERC-20 contracts, verifies balances on-chain via the RPC fallback,
 * and returns contract-keyed holdings. Not yet consumed by any UI — the
 * portfolio and profile pages still render the curated path until Stage 4.
 *
 * The Envio token is read only inside `createEnvioLogSource` (server-side); no
 * credential is ever returned to the browser.
 */

import { sanitizeAddressList } from "@/lib/addresses";
import { withRpcFallback } from "@/lib/rpc";
import { resolveDiscoveryProvider } from "@/lib/assets/config";
import { discoverAndVerifyFungibles } from "@/lib/assets/discover";
import { createEnvioLogSource } from "@/lib/assets/envioClient";
import { CuratedAssetProvider } from "@/lib/assets/providers/curated";
import { EnvioHyperSyncProvider } from "@/lib/assets/providers/envioHyperSync";
import type { Classification, DiscoveryStatus, PartialFailure } from "@/lib/assets/types";

export type WireFungibleHolding = {
  chainId: number;
  wallet: string;
  contractAddress: string;
  standard: "erc20";
  raw: string;
  decimals: number;
  symbol: string | null;
  name: string | null;
  metadataQuality: string;
  classification: Classification;
  verification: string;
  discoverySource: string;
  incomplete: boolean;
};

export type DiscoverAssetsResult =
  | {
      ok: true;
      holdings: WireFungibleHolding[];
      status: DiscoveryStatus;
      failures: PartialFailure[];
      source: string;
      blockNumber: string;
    }
  | { ok: false; error: string };

export async function discoverAssetsAction(addresses: string[]): Promise<DiscoverAssetsResult> {
  const clean = sanitizeAddressList(addresses);
  if (clean.length === 0) {
    return { ok: false, error: "Add at least one valid wallet address." };
  }

  const flag = resolveDiscoveryProvider();
  const envio = new EnvioHyperSyncProvider(createEnvioLogSource());
  const curated = new CuratedAssetProvider();

  try {
    const outcome = await withRpcFallback((client) =>
      discoverAndVerifyFungibles(client, clean, { flag, envio, curated }),
    );
    const d = outcome.value;
    return {
      ok: true,
      holdings: d.holdings.map((h) => ({ ...h, raw: h.raw.toString() })),
      status: d.status,
      failures: d.failures,
      source: d.source,
      blockNumber: d.block.toString(),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.split("\n")[0]! : String(err) };
  }
}
