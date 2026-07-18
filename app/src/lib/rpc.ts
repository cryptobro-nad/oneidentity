/**
 * RPC access with explicit, observable fallback.
 *
 * viem ships a `fallback()` transport, but it hides *which* endpoint served a
 * request. The portfolio UI has to report that honestly, so failover is done
 * here instead: try each endpoint in order, record what failed, and surface the
 * endpoint that actually answered.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { RPC_ENDPOINTS, monad } from "./chain";

export type RpcFailure = { url: string; error: string };

export type RpcOutcome<T> = {
  value: T;
  endpointUsed: string;
  failedEndpoints: RpcFailure[];
};

/** Thrown only when every configured endpoint failed. Never returns a value. */
export class AllEndpointsFailedError extends Error {
  constructor(readonly failures: RpcFailure[]) {
    super(
      `All ${failures.length} RPC endpoint(s) failed: ` +
        failures.map((f) => `${f.url} (${f.error})`).join("; "),
    );
    this.name = "AllEndpointsFailedError";
  }
}

export function createClientFor(url: string): PublicClient {
  return createPublicClient({
    chain: monad,
    transport: http(url, { timeout: 20_000, retryCount: 1, batch: { wait: 16 } }),
  }) as PublicClient;
}

const errorText = (err: unknown): string => {
  if (err instanceof Error) {
    const firstLine = err.message.split("\n")[0];
    return firstLine && firstLine.length > 0 ? firstLine : err.name;
  }
  return String(err);
};

export type WithRpcOptions = {
  endpoints?: readonly string[];
  /** Injected in tests; defaults to a real viem client. */
  clientFactory?: (url: string) => PublicClient;
};

/**
 * Runs `task` against the first endpoint that works.
 *
 * Only a thrown error triggers failover. Contract-level failures inside the
 * task (a reverting `balanceOf`, say) are *not* RPC failures and must be
 * handled by the task itself — retrying those on another node would just
 * produce the same revert while hiding it from the user.
 */
export async function withRpcFallback<T>(
  task: (client: PublicClient, url: string) => Promise<T>,
  options: WithRpcOptions = {},
): Promise<RpcOutcome<T>> {
  const endpoints = options.endpoints ?? RPC_ENDPOINTS;
  const factory = options.clientFactory ?? createClientFor;
  const failedEndpoints: RpcFailure[] = [];

  for (const url of endpoints) {
    try {
      const value = await task(factory(url), url);
      return { value, endpointUsed: url, failedEndpoints };
    } catch (err) {
      failedEndpoints.push({ url, error: errorText(err) });
    }
  }

  throw new AllEndpointsFailedError(failedEndpoints);
}

export { errorText };
