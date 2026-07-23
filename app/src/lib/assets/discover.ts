/**
 * Fungible asset discovery orchestration.
 *
 * Chooses the provider by the server flag, discovers candidates, verifies them
 * on-chain, and — crucially — falls back to the curated provider when the
 * dynamic one is unavailable, without ever hiding the whole result. A provider
 * failure downgrades the status to `partial`/`unavailable` and is surfaced as a
 * truthful failure, never as an empty or zeroed portfolio.
 */

import type { PublicClient } from "viem";
import type { PortfolioAddress } from "@/lib/types";
import type { DiscoveryProviderName } from "./config";
import type { AssetDiscoveryProvider } from "./provider";
import { verifyFungibles } from "./verify";
import type { DiscoveryStatus, FungibleHolding, PartialFailure } from "./types";

export type FungibleDiscovery = {
  holdings: FungibleHolding[];
  status: DiscoveryStatus;
  failures: PartialFailure[];
  /** The provider whose candidates were actually used. */
  source: string;
  block: bigint;
};

export async function discoverAndVerifyFungibles(
  client: PublicClient,
  wallets: readonly PortfolioAddress[],
  deps: {
    flag: DiscoveryProviderName;
    envio: AssetDiscoveryProvider;
    curated: AssetDiscoveryProvider;
  },
): Promise<FungibleDiscovery> {
  const extraFailures: PartialFailure[] = [];
  let provider =
    deps.flag === "envio" && deps.envio.configured ? deps.envio : deps.curated;

  let result = await provider.discover(wallets);

  // Dynamic provider could not run at all → fall back to curated, keeping the
  // honest notice so the UI can say coverage was reduced.
  if (provider !== deps.curated && result.status === "unavailable") {
    extraFailures.push(
      ...result.failures,
      {
        scope: "provider",
        reason: `Discovery provider "${provider.name}" unavailable; using curated fallback.`,
        blocked: false,
      },
    );
    provider = deps.curated;
    result = await deps.curated.discover(wallets);
  }

  const verified = await verifyFungibles(client, result.fungibles, wallets);
  const failures = [...extraFailures, ...result.failures, ...verified.failures];

  const status: DiscoveryStatus =
    result.status === "unavailable"
      ? "unavailable"
      : result.status === "partial" || verified.partial || failures.length > 0
        ? "partial"
        : "complete";

  return {
    holdings: verified.holdings,
    status,
    failures,
    source: provider.name,
    block: verified.block,
  };
}
