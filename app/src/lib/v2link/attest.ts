/**
 * Verifier attestation signing — SERVER ONLY.
 *
 * Produces the `LinkAttestation` signature that `ONERegistryV2` verifies. The
 * signing key (`VERIFIER_PRIVATE_KEY`) must never reach the browser; in
 * production hold it in a KMS/HSM or use an ERC-1271 multisig verifier. The
 * EIP-712 domain binds every signature to this registry and the Monad chain, and
 * the message binds primary/secondary/identity/challenge/transfer — so a
 * signature is useless anywhere but the exact intended link.
 */

import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, type TypedDataDomain } from "viem";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import type { LinkAttestation } from "./types";

export const LINK_ATTESTATION_TYPES = {
  LinkAttestation: [
    { name: "primary", type: "address" },
    { name: "secondary", type: "address" },
    { name: "one", type: "address" },
    { name: "challengeId", type: "bytes32" },
    { name: "amount", type: "uint256" },
    { name: "txHash", type: "bytes32" },
    { name: "txBlock", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "verifierNonce", type: "uint256" },
  ],
} as const;

export function attestationDomain(registry: `0x${string}`): TypedDataDomain {
  return { name: "ONE Link", version: "1", chainId: MONAD_CHAIN_ID, verifyingContract: registry };
}

/** Signs the attestation with the verifier key. `privateKey` is read from env by
 *  the caller (route); never passed to the client. */
export async function signAttestation(
  att: LinkAttestation,
  privateKey: `0x${string}`,
  registry: `0x${string}`,
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(privateKey);
  return account.signTypedData({
    domain: attestationDomain(registry),
    types: LINK_ATTESTATION_TYPES,
    primaryType: "LinkAttestation",
    message: att,
  });
}

/** Recovers the signer — used in tests and to sanity-check the configured key. */
export async function recoverAttestationSigner(
  att: LinkAttestation,
  signature: `0x${string}`,
  registry: `0x${string}`,
): Promise<`0x${string}`> {
  return recoverTypedDataAddress({
    domain: attestationDomain(registry),
    types: LINK_ATTESTATION_TYPES,
    primaryType: "LinkAttestation",
    message: att,
    signature,
  });
}
