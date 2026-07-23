/**
 * Envio HyperSync `TransferLogSource`.
 *
 * Paginates Transfer-family logs for a wallet from genesis toward chain head
 * using the response `nextBlock` continuation, mapping each log into the
 * provider-neutral row shape. Bounded by page, per-page-log and total-log caps
 * so a huge wallet returns an honest lower bound instead of an unbounded scan.
 *
 * It depends only on the injected `HyperSyncQueryClient`, never the native
 * package, so it is fully unit-testable with a fake client.
 */

import type { PortfolioAddress } from "@/lib/types";
import type { LogSourceError, LogSourceResult, TransferLogSource } from "../provider";
import { buildIncomingTransfersQuery, envioLogToRow, type HyperSyncQueryClient } from "../envioQuery";
import type { NormalizedLogRow } from "../transferLogs";

export type EnvioLogSourceLimits = {
  /** Hard cap on pages per wallet. */
  maxPages: number;
  /** Hard cap on total logs collected per wallet. */
  maxTotalLogs: number;
  /** Logs requested per page. */
  maxNumLogsPerPage: number;
};

export const ENVIO_LOG_LIMITS: EnvioLogSourceLimits = {
  maxPages: 50,
  maxTotalLogs: 20_000,
  maxNumLogsPerPage: 5_000,
};

/** Classifies a failure so the caller can distinguish "must fall back" from
 *  "transient". Auth and usage-limit errors are hard stops (blocked). */
function classifyError(message: string): { reason: string; blocked: boolean } {
  const m = message.toLowerCase();
  if (/401|403|unauthor|forbidden|api\s*token|apitoken|invalid token/.test(m)) {
    return { reason: message, blocked: true };
  }
  if (/429|rate\s*limit|usage\s*limit|quota|too many requests/.test(m)) {
    return { reason: message, blocked: true };
  }
  return { reason: message, blocked: false };
}

export class EnvioHyperSyncLogSource implements TransferLogSource {
  readonly name = "envio-hypersync";
  readonly configured = true;

  constructor(
    private readonly client: HyperSyncQueryClient,
    private readonly limits: EnvioLogSourceLimits = ENVIO_LOG_LIMITS,
  ) {}

  async collectIncomingTransfers(
    wallet: PortfolioAddress,
  ): Promise<LogSourceResult | LogSourceError> {
    const rows: NormalizedLogRow[] = [];
    let fromBlock = 0;
    let pages = 0;
    let complete = true;
    let scannedToBlock: bigint | undefined;
    let archiveHeight: bigint | undefined;

    try {
      for (;;) {
        const res = await this.client.get(
          buildIncomingTransfersQuery(wallet, fromBlock, this.limits.maxNumLogsPerPage),
        );

        for (const log of res.data?.logs ?? []) rows.push(envioLogToRow(log));

        if (res.archiveHeight !== undefined) archiveHeight = BigInt(res.archiveHeight);
        scannedToBlock = BigInt(res.nextBlock);

        // Reached chain head — this is a complete scan.
        if (res.archiveHeight !== undefined && res.nextBlock >= res.archiveHeight) break;
        // No forward progress: stop rather than loop forever.
        if (res.nextBlock <= fromBlock) break;

        // Safety caps make the result an explicit lower bound.
        if (rows.length >= this.limits.maxTotalLogs) {
          complete = false;
          break;
        }
        pages++;
        if (pages >= this.limits.maxPages) {
          complete = false;
          break;
        }

        fromBlock = res.nextBlock;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0]! : String(err);
      return classifyError(message);
    }

    return { rows, complete, scannedToBlock, archiveHeight };
  }
}
