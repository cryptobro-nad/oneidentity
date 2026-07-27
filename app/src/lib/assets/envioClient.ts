/**
 * Runtime construction of the Envio HyperSync log source.
 *
 * This is the ONLY module that imports the native `@envio-dev/hypersync-client`
 * and the ONLY place `ENVIO_API_TOKEN` is read. It is imported solely by the
 * server action, and the package is listed in `serverExternalPackages`, so the
 * token and the binary never reach a client bundle. When no token is set it
 * returns an explicitly unconfigured source so the orchestrator falls back to
 * curated rather than failing.
 */

import type { Query } from "@envio-dev/hypersync-client";
import { ENVIO_MONAD_HYPERSYNC_URL } from "./config";
import type { EnvioQuery, EnvioQueryResponse, HyperSyncQueryClient } from "./envioQuery";
import { EnvioHyperSyncLogSource } from "./providers/envioLogSource";
import type { LogSourceError, TransferLogSource } from "./provider";

class UnconfiguredEnvioLogSource implements TransferLogSource {
  readonly name = "envio-hypersync";
  readonly configured = false;
  async collectIncomingTransfers(): Promise<LogSourceError> {
    return { reason: "ENVIO_API_TOKEN is not set.", blocked: true };
  }
}

/**
 * Builds a live Envio log source, or an unconfigured one when no token is set.
 * `env` is injectable for tests, though tests never exercise the native client.
 *
 * The native package is imported dynamically and ONLY when a token is present,
 * so a deployment (or a test run) that never enables dynamic discovery never
 * loads the napi binary at all.
 */
export async function createEnvioLogSource(
  env: Record<string, string | undefined> = process.env,
): Promise<TransferLogSource> {
  const apiToken = env.ENVIO_API_TOKEN;
  if (!apiToken) return new UnconfiguredEnvioLogSource();

  const { HypersyncClient } = await import("@envio-dev/hypersync-client");
  const client = new HypersyncClient({ url: ENVIO_MONAD_HYPERSYNC_URL, apiToken });

  // The structural shapes here were verified against the client's index.d.ts;
  // the casts bridge the minimal subset used internally with the client's own
  // Query/QueryResponse types without leaking those types across the boundary.
  const queryClient: HyperSyncQueryClient = {
    get: (q: EnvioQuery) =>
      client.get(q as unknown as Query) as unknown as Promise<EnvioQueryResponse>,
  };

  return new EnvioHyperSyncLogSource(queryClient);
}
