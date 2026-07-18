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
 * Usage:
 *   node script/check-runtime-bytecode.mjs <registryAddress> [rpcUrl]
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(HERE, "..", "out", "ONERegistry.sol", "ONERegistry.json");

const address = process.argv[2];
const rpcUrl = process.argv[3] ?? "https://rpc.monad.xyz";

if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("Usage: node script/check-runtime-bytecode.mjs <registryAddress> [rpcUrl]");
  process.exit(1);
}

const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
const localRuntime = artifact.deployedBytecode.object.replace(/^0x/, "").toLowerCase();
const localCreation = artifact.bytecode.object.replace(/^0x/, "").toLowerCase();
const immutableRefs = artifact.deployedBytecode.immutableReferences ?? {};

async function rpc(method, params) {
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

const keccakNote =
  "(sha256 used for a stable local fingerprint; identity of the masked strings is what matters)";
const fingerprint = (hex) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

const chainIdHex = await rpc("eth_chainId", []);
const chainId = Number.parseInt(chainIdHex, 16);
const onChainRaw = (await rpc("eth_getCode", [address, "latest"])).replace(/^0x/, "").toLowerCase();

console.log("=".repeat(60));
console.log("ONERegistry runtime bytecode check");
console.log("=".repeat(60));
console.log(`RPC          : ${rpcUrl}`);
console.log(`Chain ID     : ${chainId}`);
console.log(`Address      : ${address}`);

if (chainId !== 143) {
  console.error(`\nFAIL: expected chain 143, got ${chainId}.`);
  process.exit(1);
}
if (onChainRaw.length === 0) {
  console.error("\nFAIL: no bytecode at that address. Nothing is deployed there.");
  process.exit(1);
}

console.log(`\nLocal runtime size : ${localRuntime.length / 2} bytes`);
console.log(`On-chain size      : ${onChainRaw.length / 2} bytes`);
console.log(`Creation bytecode fingerprint (address-independent): ${fingerprint(localCreation)}`);
console.log(`  ${keccakNote}`);

if (localRuntime.length !== onChainRaw.length) {
  console.error("\nFAIL: runtime bytecode LENGTH differs. This is a different build.");
  process.exit(1);
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
  process.exit(0);
}

// Report where it actually diverges, so a real mismatch is diagnosable.
let firstDiff = -1;
for (let i = 0; i < localMasked.length; i += 2) {
  if (localMasked[i] !== chainMasked[i] || localMasked[i + 1] !== chainMasked[i + 1]) {
    firstDiff = i / 2;
    break;
  }
}
console.error(`\nFAIL: runtime bytecode differs outside the immutable slots.`);
console.error(`      First differing byte offset: ${firstDiff}`);
console.error(`      local    : ...${localMasked.slice(firstDiff * 2, firstDiff * 2 + 32)}...`);
console.error(`      on-chain : ...${chainMasked.slice(firstDiff * 2, firstDiff * 2 + 32)}...`);
console.error("      The deployed contract was NOT built from this source/settings.");
process.exit(1);
