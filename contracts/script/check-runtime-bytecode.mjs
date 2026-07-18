#!/usr/bin/env node
/**
 * Verifies that a deployed contract's runtime bytecode matches the local build.
 *
 * Why this is not a plain hash comparison
 * ---------------------------------------
 * ONERegistry inherits OpenZeppelin's EIP712, which stores seven IMMUTABLE
 * values (_cachedThis, _cachedDomainSeparator, _cachedChainId, _hashedName,
 * _hashedVersion, _name, _version). Immutables are compiled as zero-filled
 * placeholders in the artifact and are written at construction time. Two of
 * them depend on the deployed address, so the on-chain runtime bytecode is
 * necessarily different from `deployedBytecode.object` — and different for
 * every deployment.
 *
 * Comparing raw runtime hashes therefore ALWAYS reports a mismatch and proves
 * nothing. The correct check masks the immutable regions (whose offsets the
 * compiler records in `immutableReferences`) in both sides and compares the
 * remainder, then reports the recovered immutable values separately.
 *
 * The address-independent integrity check is the CREATION bytecode hash, which
 * this script also prints.
 *
 * Exit codes: 0 = match, 1 = mismatch or bad input.
 *
 * ---------------------------------------------------------------------------
 * Windows note: why this file never calls process.exit()
 * ---------------------------------------------------------------------------
 * `process.exit()` terminates the process synchronously, without letting libuv
 * finish closing handles that are still in flight. Node's built-in fetch
 * (undici) keeps sockets in a keep-alive pool, so from the SECOND request
 * onward there is a pooled socket with a live async handle. Exiting at that
 * moment makes libuv hit
 *
 *     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 *     file src\win\async.c, line 76
 *
 * and Windows aborts with 0xC0000409 (-1073740791) — AFTER this script has
 * already printed PASS. The check itself is correct; the exit status is not,
 * which is exactly the sort of green-looking red that breaks CI.
 *
 * Reproduced minimally on Node v24.14.1 / Windows:
 *   2 requests + process.exit(0)     -> assertion, exit -1073740791
 *   2 requests + process.exitCode=0  -> clean exit 0
 *   1 request  + process.exit(0)     -> clean exit 0
 *
 * The assertion is an upstream Node/libuv issue, but it is entirely avoidable
 * here: setting `process.exitCode` lets the event loop drain and the process
 * exits with the intended status. Do not reintroduce process.exit().
 *
 * Usage:
 *   node script/check-runtime-bytecode.mjs <registryAddress> [rpcUrl]
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(HERE, "..", "out", "ONERegistry.sol", "ONERegistry.json");

const fingerprint = (hex) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

async function rpc(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

/** Replaces each immutable region with zeroes so the two sides are comparable. */
function maskImmutables(hex, refs) {
  const bytes = Buffer.from(hex, "hex");
  const regions = [];
  for (const slots of Object.values(refs)) {
    for (const { start, length } of slots) {
      bytes.fill(0, start, start + length);
      regions.push({ start, length });
    }
  }
  return { masked: bytes.toString("hex"), regions };
}

/** @returns {Promise<number>} the intended process exit code. */
async function main() {
  const address = process.argv[2];
  const rpcUrl = process.argv[3] ?? "https://rpc.monad.xyz";

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    console.error("Usage: node script/check-runtime-bytecode.mjs <registryAddress> [rpcUrl]");
    return 1;
  }

  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  const localRuntime = artifact.deployedBytecode.object.replace(/^0x/, "").toLowerCase();
  const localCreation = artifact.bytecode.object.replace(/^0x/, "").toLowerCase();
  const immutableRefs = artifact.deployedBytecode.immutableReferences ?? {};

  const chainId = Number.parseInt(await rpc(rpcUrl, "eth_chainId", []), 16);
  const onChainRaw = (await rpc(rpcUrl, "eth_getCode", [address, "latest"]))
    .replace(/^0x/, "")
    .toLowerCase();

  console.log("=".repeat(60));
  console.log("ONERegistry runtime bytecode check");
  console.log("=".repeat(60));
  console.log(`RPC          : ${rpcUrl}`);
  console.log(`Chain ID     : ${chainId}`);
  console.log(`Address      : ${address}`);

  if (chainId !== 143) {
    console.error(`\nFAIL: expected chain 143, got ${chainId}.`);
    return 1;
  }
  if (onChainRaw.length === 0) {
    console.error("\nFAIL: no bytecode at that address. Nothing is deployed there.");
    return 1;
  }

  console.log(`\nLocal runtime size : ${localRuntime.length / 2} bytes`);
  console.log(`On-chain size      : ${onChainRaw.length / 2} bytes`);
  console.log(`Creation bytecode sha256 (address-independent): ${fingerprint(localCreation)}`);

  if (localRuntime.length !== onChainRaw.length) {
    console.error("\nFAIL: runtime bytecode LENGTH differs. This is a different build.");
    return 1;
  }

  const { masked: localMasked, regions } = maskImmutables(localRuntime, immutableRefs);
  const { masked: chainMasked } = maskImmutables(onChainRaw, immutableRefs);

  console.log(`\nImmutable regions masked: ${regions.length}`);
  for (const r of regions.sort((a, b) => a.start - b.start)) {
    const value = onChainRaw.slice(r.start * 2, (r.start + r.length) * 2);
    console.log(`  offset ${String(r.start).padStart(5)} len ${r.length}  on-chain value 0x${value}`);
  }

  if (localMasked === chainMasked) {
    console.log("\nPASS: runtime bytecode matches the local artifact once immutables are masked.");
    console.log("      Every difference is confined to the recorded immutable slots.");
    return 0;
  }

  // Report where it actually diverges, so a real mismatch is diagnosable.
  let firstDiff = -1;
  for (let i = 0; i < localMasked.length; i += 2) {
    if (localMasked[i] !== chainMasked[i] || localMasked[i + 1] !== chainMasked[i + 1]) {
      firstDiff = i / 2;
      break;
    }
  }
  console.error("\nFAIL: runtime bytecode differs outside the immutable slots.");
  console.error(`      First differing byte offset: ${firstDiff}`);
  console.error(`      local    : ...${localMasked.slice(firstDiff * 2, firstDiff * 2 + 32)}...`);
  console.error(`      on-chain : ...${chainMasked.slice(firstDiff * 2, firstDiff * 2 + 32)}...`);
  console.error("      The deployed contract was NOT built from this source/settings.");
  return 1;
}

// Set the status and let the loop drain. Never process.exit() — see header.
process.exitCode = await main().catch((err) => {
  console.error(`\nFAIL: ${err instanceof Error ? err.message : String(err)}`);
  return 1;
});
