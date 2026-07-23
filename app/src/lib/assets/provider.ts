/**
 * The provider-independent asset-discovery contract.
 *
 * A provider only ever *proposes candidates* (contract addresses + standard).
 * It never returns balances the UI trusts — those come from the separate RPC
 * verification layer (Stage 2). This mirrors the existing NFT hybrid split:
 * "the indexer discovers, the chain decides."
 */

import type { PortfolioAddress } from "@/lib/types";
import type { DiscoveryResult } from "./types";
import type { NormalizedLogRow } from "./transferLogs";

export interface AssetDiscoveryProvider {
  readonly name: string;
  /** True when the provider has what it needs to run (e.g. an API token). */
  readonly configured: boolean;
  /** Discovers candidate holdings across a set of wallets. Never throws for a
   *  single-wallet failure — it records it in `failures` and continues. */
  discover(wallets: readonly PortfolioAddress[]): Promise<DiscoveryResult>;
}

/**
 * The transport boundary between a discovery provider and a concrete log
 * backend (Envio HyperSync over its client or HTTP `/query`, a test fixture,
 * etc.). Providers depend on THIS, never on a vendor SDK directly, which is
 * what keeps the vendor choice swappable and the parsing logic unit-testable
 * without any network.
 */
export type LogSourceResult = {
  rows: NormalizedLogRow[];
  /** False when a page/candidate/history cap stopped the scan short of head. */
  complete: boolean;
  /** Highest block actually scanned. */
  scannedToBlock?: bigint;
  /** Backend archive height, when the backend reports it. */
  archiveHeight?: bigint;
};

export type LogSourceError = {
  reason: string;
  /** Hard stop (no token, hit a usage limit) vs a transient/timeout failure. */
  blocked: boolean;
};

export interface TransferLogSource {
  readonly name: string;
  readonly configured: boolean;
  /**
   * Returns Transfer-family logs in which `wallet` is a recipient, paginated to
   * completion or until the source's safety limits. Resolves to a
   * `LogSourceError` rather than throwing so one wallet's failure is contained.
   */
  collectIncomingTransfers(
    wallet: PortfolioAddress,
  ): Promise<LogSourceResult | LogSourceError>;
}

export function isLogSourceError(v: LogSourceResult | LogSourceError): v is LogSourceError {
  return (v as LogSourceError).reason !== undefined && (v as LogSourceResult).rows === undefined;
}
