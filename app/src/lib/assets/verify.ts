/**
 * RPC verification of ERC-20 candidates.
 *
 * Discovery only proposes contract addresses; the truth shown to a user comes
 * from here — one Multicall3 batch of `balanceOf`/`decimals`/`symbol`/`name`
 * per candidate at a single pinned block. Symbol and decimals are read
 * on-chain, never taken from logs. A read that FAILS is reported as a failure,
 * never rendered as a zero balance; a successful ZERO is omitted.
 */

import { erc20Abi, getAddress, type PublicClient } from "viem";
import { errorText } from "@/lib/rpc";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import { ALL_BALANCE_TOKENS } from "@/lib/tokens";
import type { PortfolioAddress } from "@/lib/types";
import type { FungibleCandidate, FungibleHolding, PartialFailure } from "./types";

type MulticallEntry = { status: "success"; result: unknown } | { status: "failure"; error: unknown };

/** Contracts on the curated allowlist are "recognized"; everything else is
 *  "other" (shown, never hidden for being unknown). */
const RECOGNIZED = new Set(ALL_BALANCE_TOKENS.map((t) => t.address.toLowerCase()));

export type FungibleVerification = {
  holdings: FungibleHolding[];
  failures: PartialFailure[];
  block: bigint;
  partial: boolean;
};

export async function verifyFungibles(
  client: PublicClient,
  candidates: readonly FungibleCandidate[],
  wallets: readonly PortfolioAddress[],
): Promise<FungibleVerification> {
  const holdings: FungibleHolding[] = [];
  const failures: PartialFailure[] = [];

  if (candidates.length === 0) {
    return { holdings, failures, block: await client.getBlockNumber(), partial: false };
  }

  const normalisedWallets = wallets.map((w) => getAddress(w) as PortfolioAddress);
  const blockNumber = await client.getBlockNumber();

  // balanceOf for every (candidate, wallet); decimals/symbol/name per candidate.
  const balanceCalls = candidates.flatMap((c) =>
    normalisedWallets.map((w) => ({
      address: c.contractAddress,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [w] as const,
    })),
  );
  const metaCalls = candidates.flatMap((c) => [
    { address: c.contractAddress, abi: erc20Abi, functionName: "decimals" as const },
    { address: c.contractAddress, abi: erc20Abi, functionName: "symbol" as const },
    { address: c.contractAddress, abi: erc20Abi, functionName: "name" as const },
  ]);

  const [balanceResults, metaResults] = (await Promise.all([
    client.multicall({ contracts: balanceCalls, allowFailure: true, blockNumber }),
    client.multicall({ contracts: metaCalls, allowFailure: true, blockNumber }),
  ])) as [readonly MulticallEntry[], readonly MulticallEntry[]];

  let partial = false;

  candidates.forEach((candidate, ci) => {
    const dEntry = metaResults[ci * 3];
    const sEntry = metaResults[ci * 3 + 1];
    const nEntry = metaResults[ci * 3 + 2];

    const decimals =
      dEntry?.status === "success" ? Number(dEntry.result as number | bigint) : null;
    const symbol = sEntry?.status === "success" ? String(sEntry.result) : null;
    const name = nEntry?.status === "success" ? String(nEntry.result) : null;
    const metadataOk = decimals !== null && symbol !== null && name !== null;
    if (!metadataOk) partial = true;

    const recognized = RECOGNIZED.has(candidate.contractAddress.toLowerCase());

    normalisedWallets.forEach((wallet, wi) => {
      const entry = balanceResults[ci * normalisedWallets.length + wi];
      if (!entry || entry.status !== "success") {
        // Unknown, not zero: record a failure so it is never rendered as "0".
        partial = true;
        failures.push({
          scope: "contract",
          wallet,
          contract: candidate.contractAddress,
          reason: entry ? errorText(entry.error) : "no result returned",
          blocked: false,
        });
        return;
      }
      const raw = entry.result as bigint;
      if (raw === 0n) return; // successful zero → omit

      holdings.push({
        chainId: MONAD_CHAIN_ID,
        wallet,
        contractAddress: candidate.contractAddress,
        standard: "erc20",
        raw,
        decimals: decimals ?? 18,
        symbol,
        name,
        metadataQuality: metadataOk ? "onchain" : decimals !== null ? "partial" : "missing",
        classification: recognized ? "recognized" : "other",
        verification: recognized ? "curated-allowlist" : "unknown",
        discoverySource: candidate.source,
        incomplete: !metadataOk,
      });
    });
  });

  return { holdings, failures, block: blockNumber, partial };
}
