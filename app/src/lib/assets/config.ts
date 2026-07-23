/**
 * Server-side asset-discovery configuration.
 *
 * The provider is chosen by a server-only environment variable. The default is
 * always `curated` so that, unconfigured, the app behaves exactly as it does
 * today — dynamic discovery is strictly opt-in and reversible by flipping the
 * flag back.
 *
 * There is deliberately no `NEXT_PUBLIC_` variant: neither the provider choice
 * nor the Envio token is ever exposed to the browser.
 */

export type DiscoveryProviderName = "curated" | "envio";

/** Reads the flag. `env` is injectable for tests. Unknown values → `curated`. */
export function resolveDiscoveryProvider(
  env: Record<string, string | undefined> = process.env,
): DiscoveryProviderName {
  return env.ASSET_DISCOVERY_PROVIDER === "envio" ? "envio" : "curated";
}

export const ENVIO_MONAD_HYPERSYNC_URL = "https://monad.hypersync.xyz";
