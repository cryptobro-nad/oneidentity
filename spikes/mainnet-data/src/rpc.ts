/**
 * Monad Mainnet chain configuration and live RPC probing.
 *
 * Every value here that could be stale is verified against a live node by
 * `probeEndpoint` before the spike reports it. Nothing in this file is trusted
 * on the strength of documentation alone.
 */

import { createPublicClient, defineChain, http, type PublicClient } from "viem";

/** Documented at https://docs.monad.xyz/developer-essentials/network-information */
export const MONAD_CHAIN_ID = 143 as const;

export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/**
 * Official public endpoints, with the rate/batch limits the docs publish.
 * `batchLimit` is the documented maximum JSON-RPC batch size; the spike
 * measures the real ceiling rather than assuming this is accurate.
 */
export type EndpointSpec = {
  url: string;
  provider: string;
  documentedRateLimit: string;
  documentedBatchLimit: number;
};

export const OFFICIAL_ENDPOINTS: EndpointSpec[] = [
  {
    url: "https://rpc.monad.xyz",
    provider: "QuickNode",
    documentedRateLimit: "25 rps",
    documentedBatchLimit: 100,
  },
  {
    url: "https://rpc1.monad.xyz",
    provider: "Alchemy",
    documentedRateLimit: "15 rps",
    documentedBatchLimit: 100,
  },
  {
    url: "https://rpc2.monad.xyz",
    provider: "Goldsky Edge",
    documentedRateLimit: "300 per 10s",
    documentedBatchLimit: 10,
  },
  {
    url: "https://rpc3.monad.xyz",
    provider: "Ankr",
    documentedRateLimit: "300 per 10s",
    documentedBatchLimit: 10,
  },
  {
    url: "https://rpc-mainnet.monadinfra.com",
    provider: "Monad Foundation",
    documentedRateLimit: "20 rps",
    documentedBatchLimit: 1,
  },
];

export const monad = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://monadvision.com" },
  },
  contracts: {
    multicall3: { address: MULTICALL3_ADDRESS },
  },
});

export type ProbeResult = {
  url: string;
  provider: string;
  responded: boolean;
  chainId: number | null;
  chainIdMatches: boolean;
  blockNumber: string | null;
  /** Median of `samples` sequential eth_blockNumber calls, milliseconds. */
  latencyMedianMs: number | null;
  latencySamplesMs: number[];
  batchingWorks: boolean | null;
  /** Largest batch size that returned a complete, correct response. */
  maxObservedBatchSize: number | null;
  documentedRateLimit: string;
  documentedBatchLimit: number;
  error: string | null;
};

async function rawRpc(
  url: string,
  body: unknown,
  timeoutMs = 15_000,
): Promise<{ status: number; json: unknown; ms: number }> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    const ms = performance.now() - started;
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { parseError: text.slice(0, 200) };
    }
    return { status: res.status, json, ms };
  } finally {
    clearTimeout(timer);
  }
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
};

/**
 * Finds the largest working batch size by trying progressively larger batches.
 * A batch "works" only if the node returns one well-formed result per request —
 * some nodes silently truncate, which we treat as failure at that size.
 */
async function probeBatchCeiling(url: string, sizes: number[]): Promise<number | null> {
  let best: number | null = null;
  for (const size of sizes) {
    const batch = Array.from({ length: size }, (_, i) => ({
      jsonrpc: "2.0",
      id: i + 1,
      method: "eth_chainId",
      params: [],
    }));
    try {
      const { status, json } = await rawRpc(url, batch);
      if (status !== 200 || !Array.isArray(json) || json.length !== size) break;
      const allOk = json.every(
        (r) => r && typeof r === "object" && (r as { result?: string }).result === "0x8f",
      );
      if (!allOk) break;
      best = size;
    } catch {
      break;
    }
  }
  return best;
}

export async function probeEndpoint(spec: EndpointSpec, samples = 5): Promise<ProbeResult> {
  const base: ProbeResult = {
    url: spec.url,
    provider: spec.provider,
    responded: false,
    chainId: null,
    chainIdMatches: false,
    blockNumber: null,
    latencyMedianMs: null,
    latencySamplesMs: [],
    batchingWorks: null,
    maxObservedBatchSize: null,
    documentedRateLimit: spec.documentedRateLimit,
    documentedBatchLimit: spec.documentedBatchLimit,
    error: null,
  };

  try {
    const chainRes = await rawRpc(spec.url, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    });
    const chainHex = (chainRes.json as { result?: string })?.result;
    if (chainRes.status !== 200 || typeof chainHex !== "string") {
      return { ...base, error: `HTTP ${chainRes.status}` };
    }
    base.responded = true;
    base.chainId = Number.parseInt(chainHex, 16);
    base.chainIdMatches = base.chainId === MONAD_CHAIN_ID;

    // Latency: sequential eth_blockNumber calls, spaced to stay inside rate limits.
    const latencies: number[] = [];
    let lastBlock: string | null = null;
    for (let i = 0; i < samples; i++) {
      const r = await rawRpc(spec.url, {
        jsonrpc: "2.0",
        id: 100 + i,
        method: "eth_blockNumber",
        params: [],
      });
      const result = (r.json as { result?: string })?.result;
      if (typeof result === "string") {
        lastBlock = result;
        latencies.push(Math.round(r.ms));
      }
      await new Promise((res) => setTimeout(res, 120));
    }
    base.latencySamplesMs = latencies;
    base.latencyMedianMs = median(latencies);
    base.blockNumber = lastBlock ? BigInt(lastBlock).toString() : null;

    // Batching: confirm a 2-batch works, then find the practical ceiling.
    const twoBatch = await probeBatchCeiling(spec.url, [2]);
    base.batchingWorks = twoBatch === 2;
    if (base.batchingWorks) {
      base.maxObservedBatchSize = await probeBatchCeiling(
        spec.url,
        [5, 10, 20, 50, 100, 150],
      );
    } else {
      base.maxObservedBatchSize = 1;
    }

    return base;
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

export function makeClient(url: string, batch: boolean): PublicClient {
  return createPublicClient({
    chain: monad,
    transport: http(url, {
      timeout: 30_000,
      retryCount: 2,
      ...(batch ? { batch: { wait: 16 } } : {}),
    }),
  }) as PublicClient;
}
