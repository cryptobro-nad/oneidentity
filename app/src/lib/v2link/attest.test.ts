import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverAttestationSigner, signAttestation } from "./attest";
import type { LinkAttestation } from "./types";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const REGISTRY = "0x1111111111111111111111111111111111111111" as const;
const REGISTRY2 = "0x2222222222222222222222222222222222222222" as const;

const att: LinkAttestation = {
  primary: "0xB09684f5486d1af80699BbC27f14dd5A905da873",
  secondary: "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1",
  one: "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946",
  challengeId: "0xabc0000000000000000000000000000000000000000000000000000000000001",
  amount: 15000000000000000n,
  txHash: "0xdef0000000000000000000000000000000000000000000000000000000000002",
  txBlock: 110n,
  deadline: 1_700_000_600n,
  verifierNonce: 7n,
};

describe("attestation signing", () => {
  it("recovers to the verifier key for the same registry", async () => {
    const sig = await signAttestation(att, KEY, REGISTRY);
    const signer = await recoverAttestationSigner(att, sig, REGISTRY);
    expect(signer.toLowerCase()).toBe(privateKeyToAccount(KEY).address.toLowerCase());
  });

  it("does not recover to the verifier when the registry (domain) differs", async () => {
    const sig = await signAttestation(att, KEY, REGISTRY);
    const signer = await recoverAttestationSigner(att, sig, REGISTRY2);
    expect(signer.toLowerCase()).not.toBe(privateKeyToAccount(KEY).address.toLowerCase());
  });

  it("does not recover to the verifier when a field is tampered", async () => {
    const sig = await signAttestation(att, KEY, REGISTRY);
    const tampered = { ...att, secondary: att.one };
    const signer = await recoverAttestationSigner(tampered, sig, REGISTRY);
    expect(signer.toLowerCase()).not.toBe(privateKeyToAccount(KEY).address.toLowerCase());
  });
});
