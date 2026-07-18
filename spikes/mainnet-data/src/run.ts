/**
 * Monad Mainnet data spike runner.
 *
 * Read-only. Never signs, never deploys, never needs a private key.
 * Writes results/spike-output.json for inspection.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, type Address } from "viem";

import {
  MONAD_CHAIN_ID,
  MULTICALL3_ADDRESS,
  OFFICIAL_ENDPOINTS,
  makeClient,
  probeEndpoint,
  type ProbeResult,
} from "./rpc.js";
import {
  CANDIDATES_NOT_CONFIGURED,
  SUPPORTED_STABLECOINS,
  fetchOfficialTokenList,
  verifyStablecoin,
  type StablecoinVerification,
} from "./stablecoins.js";
import { findErc721Holdings, findTokenHolders, type DiscoveredNft } from "./discovery.js";
import {
  BlockVisionProvider,
  EtherscanV2Provider,
  OnChainScopedProvider,
  ProviderBlockedError,
  RaribleProvider,
  SequenceScopedProvider,
  ThirdwebInsightProvider,
  type NftDataProvider,
} from "./nft-provider.js";
import {
  aggregateNfts,
  compareSnapshots,
  fetchBalancesIndividually,
  fetchBalancesViaMulticall,
  type WalletNftOutcome,
} from "./aggregate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, "..", "results", "spike-output.json");

const log = (...args: unknown[]) => console.log(...args);
const section = (title: string) => log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);

const jsonSafe = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val)));

async function main() {
  const startedAt = new Date().toISOString();
  log(`ONE — Monad Mainnet data spike`);
  log(`Started: ${startedAt}`);
  log(`Node: ${process.version}`);

  // -------------------------------------------------------------------------
  // 1. RPC verification
  // -------------------------------------------------------------------------
  section("1. RPC ENDPOINTS");
  const probes: ProbeResult[] = [];
  for (const spec of OFFICIAL_ENDPOINTS) {
    const p = await probeEndpoint(spec);
    probes.push(p);
    log(
      `${p.responded ? "OK  " : "FAIL"} ${p.url.padEnd(38)} ` +
        `chainId=${p.chainId ?? "-"} ` +
        `block=${p.blockNumber ?? "-"} ` +
        `median=${p.latencyMedianMs ?? "-"}ms ` +
        `batch=${p.batchingWorks ? `yes(max ${p.maxObservedBatchSize})` : "no"}` +
        (p.error ? ` err=${p.error}` : ""),
    );
  }

  const healthy = probes.filter((p) => p.responded && p.chainIdMatches);
  if (healthy.length === 0) throw new Error("No healthy Monad RPC endpoint. Aborting.");

  const ranked = [...healthy].sort(
    (a, b) => (a.latencyMedianMs ?? 1e9) - (b.latencyMedianMs ?? 1e9),
  );
  const primary = ranked[0]!;
  const fallback = ranked.find((p) => p.url !== primary.url) ?? primary;
  log(`\nPrimary : ${primary.url} (${primary.provider}, ${primary.latencyMedianMs}ms median)`);
  log(`Fallback: ${fallback.url} (${fallback.provider}, ${fallback.latencyMedianMs}ms median)`);

  const client = makeClient(primary.url, false);
  const batchClient = makeClient(primary.url, true);

  // Confirm Multicall3 is actually deployed at the documented address.
  const mcCode = await client.getCode({ address: MULTICALL3_ADDRESS });
  const multicallDeployed = Boolean(mcCode && mcCode !== "0x");
  log(`Multicall3 ${MULTICALL3_ADDRESS}: ${multicallDeployed ? "deployed" : "NOT DEPLOYED"}`);

  const headBlock = await client.getBlockNumber();
  log(`Head block: ${headBlock}`);

  // -------------------------------------------------------------------------
  // 2. Stablecoins
  // -------------------------------------------------------------------------
  section("2. STABLECOINS");
  const tokenList = await fetchOfficialTokenList();
  log(
    `Token list: ${tokenList.ok ? "OK" : `FAILED ${tokenList.error}`} ` +
      `name="${tokenList.listName}" version=${tokenList.version} ` +
      `timestamp=${tokenList.timestamp} tokens=${tokenList.tokenCount}`,
  );

  // A probe address for balanceOf; refined below once holders are discovered.
  const bootstrapProbe = getAddress("0x0000000000000000000000000000000000000001");

  const verifications: StablecoinVerification[] = [];
  for (const sc of [...SUPPORTED_STABLECOINS, ...CANDIDATES_NOT_CONFIGURED]) {
    const v = await verifyStablecoin(client, sc, tokenList.entries, bootstrapProbe);
    verifications.push(v);
    const configured = SUPPORTED_STABLECOINS.some((s) => s.address === sc.address);
    log(
      `${v.verdict.padEnd(19)} ${sc.symbol.padEnd(6)} ${sc.address} ` +
        `name="${v.onChain.name}" symbol="${v.onChain.symbol}" dec=${v.onChain.decimals} ` +
        `code=${v.codeSize}B proxy=${v.proxy.looksProxied} ` +
        `inList=${v.inOfficialTokenList} ${configured ? "[CONFIGURED]" : "[NOT CONFIGURED]"}`,
    );
    if (v.errors.length) log(`    errors: ${v.errors.join(" | ")}`);
  }

  // -------------------------------------------------------------------------
  // 3. Discover real holders
  // -------------------------------------------------------------------------
  section("3. DISCOVERING REAL HOLDER ADDRESSES (from live Transfer logs)");
  const usdc = getAddress(SUPPORTED_STABLECOINS[0]!.address);
  const holderSearch = await findTokenHolders(client, usdc, 3);
  log(
    `USDC holders found: ${holderSearch.holders.length} ` +
      `(scanned ${holderSearch.blocksScanned} blocks, ${holderSearch.logsSeen} logs)` +
      (holderSearch.error ? ` err=${holderSearch.error}` : ""),
  );
  for (const h of holderSearch.holders) log(`  ${h}`);

  section("4. DISCOVERING REAL ERC-721 OWNERS (from live Transfer logs)");
  const nftSearch = await findErc721Holdings(client, 5, { window: 50n, maxWindows: 24 });
  log(
    `ERC-721 holdings confirmed via ownerOf(): ${nftSearch.found.length} ` +
      `(scanned ${nftSearch.blocksScanned} blocks, ${nftSearch.erc721LogsSeen} ERC-721 logs, ` +
      `${nftSearch.collectionsSeen} collections)` +
      (nftSearch.error ? ` err=${nftSearch.error}` : ""),
  );
  for (const n of nftSearch.found) {
    log(
      `  owner=${n.owner} collection=${n.collection} tokenId=${n.tokenId.slice(0, 20)}… ` +
        `name="${n.collectionName}" erc721=${n.supportsErc721Interface} bal=${n.ownerCollectionBalance}`,
    );
  }

  // Wallet set for aggregation: discovered holders plus NFT owners, max 5.
  const walletSet: Address[] = [];
  for (const a of [...holderSearch.holders, ...nftSearch.found.map((n) => n.owner)]) {
    const norm = getAddress(a);
    if (!walletSet.includes(norm) && walletSet.length < 5) walletSet.push(norm);
  }
  if (walletSet.length < 2) throw new Error("Could not discover >=2 live wallets. Aborting.");
  log(`\nWallet set for aggregation (${walletSet.length}): ${walletSet.join(", ")}`);

  // -------------------------------------------------------------------------
  // 5. Balance aggregation: individual vs Multicall3
  // -------------------------------------------------------------------------
  section("5. BALANCE AGGREGATION");
  const pinnedBlock = await client.getBlockNumber();
  log(`Pinned block: ${pinnedBlock}`);

  const individual = await fetchBalancesIndividually(
    client,
    walletSet,
    SUPPORTED_STABLECOINS,
    pinnedBlock,
  );
  log(`individual : ${individual.elapsedMs}ms partial=${individual.partial}`);

  const viaMulticall = await fetchBalancesViaMulticall(
    batchClient,
    walletSet,
    SUPPORTED_STABLECOINS,
    pinnedBlock,
  );
  log(`multicall3 : ${viaMulticall.elapsedMs}ms partial=${viaMulticall.partial}`);

  const comparison = compareSnapshots(individual, viaMulticall);
  log(
    `\nAgreement: ${comparison.identical ? "IDENTICAL ✓" : `MISMATCH (${comparison.mismatches.length})`}`,
  );
  for (const m of comparison.mismatches) {
    log(`  ${m.kind} ${m.wallet} ${m.token ?? ""} individual=${m.individual} multicall=${m.multicall}`);
  }

  log(`\nCombined totals @ block ${pinnedBlock}:`);
  log(`  MON  ${individual.totals.nativeFormatted}`);
  for (const t of individual.totals.perToken) {
    log(
      `  ${t.symbol.padEnd(5)} ${t.formatted}` +
        (t.failedWallets.length ? `  (FAILED for ${t.failedWallets.length} wallet(s))` : ""),
    );
  }

  // Failure surfacing: a bogus token must produce an error row, never a zero.
  const failureProbe = await fetchBalancesIndividually(
    client,
    walletSet.slice(0, 1),
    [
      {
        chainId: MONAD_CHAIN_ID,
        address: "0x000000000000000000000000000000000000dEaD",
        name: "Not A Token",
        symbol: "NOPE",
        decimals: 18,
      },
    ],
    pinnedBlock,
  );
  const surfaced = failureProbe.tokens.every((t) => !t.result.ok) && failureProbe.partial;
  log(
    `\nFailure surfacing check (balanceOf on a non-token): ` +
      `${surfaced ? "PASS — reported as error, flagged partial" : "FAIL — swallowed"}`,
  );

  // -------------------------------------------------------------------------
  // 6. NFT providers
  // -------------------------------------------------------------------------
  section("6. NFT PROVIDERS");

  // Collections discovered on-chain, used by the collection-scoped providers.
  const discoveredCollections: Address[] = [];
  for (const n of nftSearch.found) {
    if (!discoveredCollections.includes(n.collection)) discoveredCollections.push(n.collection);
  }
  log(`Candidate collections from chain: ${discoveredCollections.join(", ") || "(none)"}`);

  const env = process.env;
  const providers: NftDataProvider[] = [
    new OnChainScopedProvider(client, discoveredCollections),
    new SequenceScopedProvider(discoveredCollections),
    new ThirdwebInsightProvider(env["THIRDWEB_CLIENT_ID"]),
    new BlockVisionProvider(env["BLOCKVISION_API_KEY"]),
    new EtherscanV2Provider(env["ETHERSCAN_API_KEY"]),
    new RaribleProvider(env["RARIBLE_API_KEY"]),
  ];

  const providerReports: Array<{
    provider: string;
    canEnumerateWalletWide: boolean;
    status: "EXECUTED" | "BLOCKED" | "FAILED";
    detail: string;
    elapsedMs: number | null;
    nftsReturned: number | null;
    aggregate: unknown;
  }> = [];

  for (const provider of providers) {
    const outcomes: WalletNftOutcome[] = [];
    let status: "EXECUTED" | "BLOCKED" | "FAILED" = "EXECUTED";
    let detail = "";
    const t0 = performance.now();

    for (const wallet of walletSet) {
      const w0 = performance.now();
      try {
        const nfts = await provider.getWalletNfts(wallet);
        outcomes.push({
          wallet,
          result: { ok: true, value: nfts },
          elapsedMs: Math.round(performance.now() - w0),
        });
      } catch (err) {
        if (err instanceof ProviderBlockedError) {
          status = "BLOCKED";
          detail = `missing ${err.missingCredential} — reproduce: ${err.reproduceCommand}`;
          break;
        }
        status = "FAILED";
        outcomes.push({
          wallet,
          result: { ok: false, error: err instanceof Error ? err.message : String(err) },
          elapsedMs: Math.round(performance.now() - w0),
        });
      }
    }

    const elapsed = Math.round(performance.now() - t0);
    if (status === "BLOCKED") {
      log(`\n[BLOCKED]  ${provider.name}\n   ${detail}`);
      providerReports.push({
        provider: provider.name,
        canEnumerateWalletWide: provider.canEnumerateWalletWide,
        status,
        detail,
        elapsedMs: null,
        nftsReturned: null,
        aggregate: null,
      });
      continue;
    }

    const agg = aggregateNfts(provider.name, outcomes);
    log(
      `\n[${status}] ${provider.name} — ${elapsed}ms\n` +
        `   wallets ok=${agg.walletsSucceeded}/${agg.walletsRequested} ` +
        `nfts=${agg.totalNfts} collections=${agg.collections.length} ` +
        `dupesDropped=${agg.duplicatesDropped} partial=${agg.partial}`,
    );
    for (const f of agg.walletsFailed) log(`   FAILED wallet ${f.wallet}: ${f.error}`);
    for (const c of agg.collections) {
      const withMeta = c.tokens.filter((t) => !t.metadataMissing).length;
      log(
        `   ${c.collectionAddress} "${c.collectionName ?? "?"}" count=${c.count} ` +
          `owners=${c.owners.length} metadataPresent=${withMeta}/${c.tokens.length}`,
      );
    }

    providerReports.push({
      provider: provider.name,
      canEnumerateWalletWide: provider.canEnumerateWalletWide,
      status,
      detail: detail || "executed against live Monad Mainnet",
      elapsedMs: elapsed,
      nftsReturned: agg.totalNfts,
      aggregate: jsonSafe(agg),
    });
  }

  // -------------------------------------------------------------------------
  // 7. Cross-source verification of one real NFT
  // -------------------------------------------------------------------------
  section("7. CROSS-SOURCE NFT VERIFICATION");
  let crossCheck: unknown = null;
  const sample: DiscoveredNft | undefined = nftSearch.found[0];
  if (sample) {
    const seq = await SequenceScopedProvider.rpc("GetTokenBalancesByContract", {
      filter: { accountAddresses: [sample.owner], contractAddresses: [sample.collection] },
      includeMetadata: true,
    });
    const seqBalances = (
      (seq.json as { balances?: Array<{ tokenID?: string; contractType?: string }> }).balances ?? []
    ).filter((b) => b.contractType === "ERC721");
    const seqTokenIds = seqBalances.map((b) => String(b.tokenID));
    const seqHasSampleToken = seqTokenIds.includes(sample.tokenId);

    log(`Source 1 — direct RPC ownerOf(): owner=${sample.owner} CONFIRMED`);
    log(
      `Source 2 — Sequence indexer: HTTP ${seq.status} ${seq.ms}ms, ` +
        `${seqBalances.length} ERC-721 entries for this collection`,
    );

    // Re-verify each token Sequence claims, against the chain. This is the real
    // test of the provider: does what it reports still hold at head?
    const perToken: Array<{ tokenId: string; onChainOwner: string | null; agrees: boolean }> = [];
    for (const tokenId of seqTokenIds) {
      let onChainOwner: string | null = null;
      try {
        onChainOwner = (await client.readContract({
          address: sample.collection,
          abi: [
            {
              type: "function",
              name: "ownerOf",
              stateMutability: "view",
              inputs: [{ name: "tokenId", type: "uint256" }],
              outputs: [{ name: "", type: "address" }],
            },
          ] as const,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        })) as string;
      } catch {
        onChainOwner = null; // burned or non-existent
      }
      const agrees = onChainOwner !== null && getAddress(onChainOwner) === sample.owner;
      perToken.push({ tokenId, onChainOwner, agrees });
      log(
        `   tokenId ${tokenId.slice(0, 22)}… → ownerOf=${
          onChainOwner ? (agrees ? "MATCHES wallet ✓" : `different owner (${onChainOwner})`) : "REVERTS (burned)"
        }`,
      );
    }
    const agreeCount = perToken.filter((t) => t.agrees).length;
    log(
      `\nSequence↔chain agreement: ${agreeCount}/${perToken.length} tokens still owned by this wallet.`,
    );
    log(
      `Sample token from the RPC scan present in Sequence: ${seqHasSampleToken ? "YES ✓" : "NO ✗ (index lag / high churn collection)"}`,
    );

    crossCheck = jsonSafe({
      wallet: sample.owner,
      collection: sample.collection,
      collectionName: sample.collectionName,
      sampleTokenIdFromRpcScan: sample.tokenId,
      source1_rpc_ownerOf: "CONFIRMED",
      source2_sequence: {
        httpStatus: seq.status,
        latencyMs: seq.ms,
        erc721EntriesReturned: seqBalances.length,
        sampleTokenPresent: seqHasSampleToken,
        perTokenReverification: perToken,
        agreementRatio: `${agreeCount}/${perToken.length}`,
      },
      tokenUri: sample.tokenUri,
    });
  } else {
    log("No ERC-721 holding discovered in the scanned range — nothing to cross-check.");
  }

  // -------------------------------------------------------------------------
  // Write results
  // -------------------------------------------------------------------------
  const output = jsonSafe({
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      node: process.version,
      chainId: MONAD_CHAIN_ID,
      headBlock: headBlock.toString(),
      pinnedBlock: pinnedBlock.toString(),
    },
    rpc: {
      probes,
      primary: primary.url,
      fallback: fallback.url,
      multicall3: { address: MULTICALL3_ADDRESS, deployed: multicallDeployed },
    },
    stablecoins: {
      tokenListSource: {
        url: tokenList.url,
        ok: tokenList.ok,
        name: tokenList.listName,
        version: tokenList.version,
        timestamp: tokenList.timestamp,
        tokenCount: tokenList.tokenCount,
      },
      configured: SUPPORTED_STABLECOINS,
      notConfigured: CANDIDATES_NOT_CONFIGURED,
      verifications,
    },
    discovery: {
      usdcHolders: holderSearch,
      erc721: {
        blocksScanned: nftSearch.blocksScanned,
        erc721LogsSeen: nftSearch.erc721LogsSeen,
        collectionsSeen: nftSearch.collectionsSeen,
        found: nftSearch.found,
      },
      walletSet,
    },
    balances: {
      pinnedBlock: pinnedBlock.toString(),
      individual,
      multicall: viaMulticall,
      comparison,
      failureSurfacingPasses: surfaced,
    },
    nftProviders: providerReports,
    crossCheck,
  });

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  section("DONE");
  log(`Results written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("\nSPIKE FAILED:", err);
  process.exit(1);
});
