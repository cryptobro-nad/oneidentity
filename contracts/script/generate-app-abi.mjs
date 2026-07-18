#!/usr/bin/env node
/**
 * Emits the application's ABI module from the compiled Foundry artifacts.
 *
 * The frontend must never hand-write ABI fragments for a deployed contract —
 * a single wrong type silently produces different calldata. Running this after
 * `forge build` guarantees `app/src/lib/registry/abi.ts` matches the artifacts
 * that produced the verified on-chain bytecode.
 *
 * Only the entries the app actually uses are exported, so an unused ABI change
 * cannot quietly alter app behaviour.
 *
 * Usage:  node script/generate-app-abi.mjs
 * Check:  node script/generate-app-abi.mjs --check   (non-zero if stale)
 *
 * Never calls process.exit() — see check-runtime-bytecode.mjs for why.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "out");
const TARGET = join(HERE, "..", "..", "app", "src", "lib", "registry", "abi.ts");

/** Entries the app is allowed to depend on. */
const REGISTRY_KEEP = new Set([
  // writes
  "createOne",
  "removeMember",
  // reads
  "predictOneAddress",
  "membersHashOf",
  "joinOneDigest",
  "exists",
  "isActive",
  "primaryOf",
  "membersOf",
  "memberCountOf",
  "activeOneOf",
  "nonces",
  "creationSaltUsed",
  "totalOnes",
  "MIN_MEMBERS",
  "MAX_MEMBERS",
  "JOIN_ONE_TYPEHASH",
  "eip712Domain",
  // events
  "OneCreated",
  "MemberRemoved",
  "OneDeactivated",
]);

const IDENTITY_KEEP = new Set([
  "registry",
  "primaryOwner",
  "getMembers",
  "memberCount",
  "isActive",
  "combinedNativeBalance",
  "combinedERC20Balance",
  "combinedERC721Balance",
  "meetsERC721Threshold",
]);

function loadAbi(contract) {
  const path = join(OUT, `${contract}.sol`, `${contract}.json`);
  return JSON.parse(readFileSync(path, "utf8")).abi;
}

/** Keeps named entries plus every error (all errors are needed for decoding). */
function select(abi, keep) {
  return abi.filter(
    (e) => e.type === "error" || (e.name !== undefined && keep.has(e.name)),
  );
}

const registryAbi = select(loadAbi("ONERegistry"), REGISTRY_KEEP);
const identityAbi = select(loadAbi("ONEIdentity"), IDENTITY_KEEP);

const missing = [...REGISTRY_KEEP].filter(
  (n) => !registryAbi.some((e) => e.name === n),
);
if (missing.length > 0) {
  console.error(`ABI is missing expected entries: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  const banner = `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Produced by contracts/script/generate-app-abi.mjs from the compiled Foundry
// artifacts, which are the same artifacts that produced the Monad Mainnet
// bytecode verified on Sourcify (exact_match).
//
// Regenerate after any contract change:
//     cd contracts && forge build && node script/generate-app-abi.mjs
//
// \`as const\` is required: viem derives all call/return types from the literal
// ABI, so widening it to \`any[]\` would silently disable type checking on every
// contract interaction.
`;

  const body =
    `${banner}\nexport const ONE_REGISTRY_ABI = ${JSON.stringify(registryAbi, null, 2)} as const;\n\n` +
    `export const ONE_IDENTITY_ABI = ${JSON.stringify(identityAbi, null, 2)} as const;\n`;

  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(TARGET, "utf8");
    } catch {
      current = "";
    }
    if (current.trim() !== body.trim()) {
      console.error("ABI module is STALE. Run: node script/generate-app-abi.mjs");
      process.exitCode = 1;
    } else {
      console.log("ABI module is up to date.");
    }
  } else {
    writeFileSync(TARGET, body);
    console.log(
      `Wrote ${TARGET}\n  registry entries: ${registryAbi.length}\n  identity entries: ${identityAbi.length}`,
    );
  }
}
