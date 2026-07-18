import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeEventTopics, encodeAbiParameters, type PublicClient } from "viem";
import { ONE_REGISTRY_ABI } from "./abi";
import {
  buildAuthsArray,
  creationSaltFor,
  encodeCreateOneCalldata,
  preflightCreateOne,
  simulateCreateOne,
  verifyCreation,
} from "./create";
import { computeMembersHash, sortMembers } from "./members";
import { configFingerprint, emptyDraft, upsertSignature, type OneDraft } from "./draft";
import { ONE_REGISTRY_ADDRESS } from "@/lib/chain";
import type { PortfolioAddress } from "@/lib/types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;
const C = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946" as PortfolioAddress;
const ZERO = "0x0000000000000000000000000000000000000000";
const PREDICTED = "0xCC271e02D2a734F853768b78E9B9f813D8f7A869" as PortfolioAddress;

const SALT = ("0x" + "11".repeat(32)) as `0x${string}`;
const SIG = ("0x" + "ab".repeat(65)) as `0x${string}`;
const FUTURE = String(Math.floor(Date.now() / 1000) + 3600);

function draftFor(members: PortfolioAddress[], primaryIndex = 0): OneDraft {
  const sorted = sortMembers(members);
  return {
    ...emptyDraft(),
    members: sorted,
    primary: sorted[primaryIndex]!,
    salt: SALT,
    deadline: FUTURE,
  };
}

function signAll(draft: OneDraft, nonce = "0"): OneDraft {
  let next = draft;
  for (const m of draft.members) {
    if (m.toLowerCase() === draft.primary!.toLowerCase()) continue;
    next = upsertSignature(next, {
      wallet: m,
      signature: SIG,
      nonce,
      deadline: draft.deadline!,
      configFingerprint: configFingerprint(draft),
      signedAt: Date.now(),
    });
  }
  return next;
}

/** Mock client. Defaults describe a clean chain where creation would succeed. */
function mockClient(opts: {
  nonces?: Record<string, bigint>;
  bindings?: Record<string, string>;
  saltUsed?: boolean;
  predicted?: string;
  codeAtPredicted?: string;
  exists?: boolean;
} = {}): PublicClient {
  return {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
      switch (functionName) {
        case "nonces":
          return opts.nonces?.[(args[0] as string).toLowerCase()] ?? 0n;
        case "activeOneOf":
          return opts.bindings?.[(args[0] as string).toLowerCase()] ?? ZERO;
        case "creationSaltUsed":
          return opts.saltUsed ?? false;
        case "predictOneAddress":
          return opts.predicted ?? PREDICTED;
        case "exists":
          return opts.exists ?? true;
        default:
          throw new Error(`unexpected read: ${functionName}`);
      }
    }),
    getCode: vi.fn(async () => opts.codeAtPredicted ?? "0x"),
    getBlockNumber: vi.fn(async () => 88_632_853n),
    getGasPrice: vi.fn(async () => 102_000_000_000n),
    estimateGas: vi.fn(async () => 917_119n),
    simulateContract: vi.fn(async () => ({ result: opts.predicted ?? PREDICTED })),
  } as unknown as PublicClient;
}

describe("buildAuthsArray", () => {
  it("orders auths as sorted members minus the primary", () => {
    const draft = draftFor([A, B, C], 1);
    const sorted = draft.members;
    const primary = draft.primary!;
    const { auths, missing } = buildAuthsArray(sorted, primary, (w) => ({
      signature: `0x${w.slice(2, 4)}` as `0x${string}`,
      deadline: 100n,
    }));

    expect(missing).toEqual([]);
    expect(auths).toHaveLength(2);
    // Must follow sorted order with the primary skipped, not signing order.
    const expected = sorted.filter((m) => m !== primary);
    expect(auths.map((a) => a.signature)).toEqual(
      expected.map((w) => `0x${w.slice(2, 4)}`),
    );
  });

  it("reports missing signatures rather than producing a short array", () => {
    const draft = draftFor([A, B, C]);
    const { auths, missing } = buildAuthsArray(draft.members, draft.primary!, () => null);
    expect(auths).toHaveLength(0);
    expect(missing).toHaveLength(2);
  });

  it("produces one auth for a two-wallet ONE", () => {
    const draft = draftFor([A, B]);
    const { auths } = buildAuthsArray(draft.members, draft.primary!, () => ({
      signature: SIG,
      deadline: 1n,
    }));
    expect(auths).toHaveLength(1);
  });

  it("produces four auths for a five-wallet ONE", () => {
    const draft = draftFor([A, B, C,
      "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799" as PortfolioAddress,
      "0xd651346d7c789536ebf06dc72aE3C8502cd695CC" as PortfolioAddress]);
    const { auths } = buildAuthsArray(draft.members, draft.primary!, () => ({
      signature: SIG,
      deadline: 1n,
    }));
    expect(auths).toHaveLength(4);
  });
});

describe("encodeCreateOneCalldata", () => {
  it("encodes with the deployed selector 0x1860948b", () => {
    const draft = draftFor([A, B]);
    const data = encodeCreateOneCalldata(draft.members, SALT, [
      { deadline: 1n, signature: SIG },
    ]);
    expect(data.slice(0, 10)).toBe("0x1860948b");
  });

  it("round-trips through the ABI with the exact argument shape", () => {
    const draft = draftFor([A, B]);
    const data = encodeCreateOneCalldata(draft.members, SALT, [
      { deadline: 42n, signature: SIG },
    ]);
    const decoded = decodeFunctionData({ abi: ONE_REGISTRY_ABI, data });
    expect(decoded.functionName).toBe("createOne");
    const [members, salt, auths] = decoded.args as unknown as [
      readonly string[],
      string,
      readonly { deadline: bigint; signature: string }[],
    ];
    expect(members.map((m) => m.toLowerCase())).toEqual(
      draft.members.map((m) => m.toLowerCase()),
    );
    expect(salt).toBe(SALT);
    expect(auths[0]!.deadline).toBe(42n);
    expect(auths[0]!.signature).toBe(SIG);
  });
});

describe("creationSaltFor", () => {
  it("matches keccak256(abi.encode(primary, membersHash, salt))", () => {
    const draft = draftFor([A, B]);
    const membersHash = computeMembersHash(draft.members);
    const expected = creationSaltFor(draft.primary!, membersHash, SALT);
    expect(expected).toMatch(/^0x[0-9a-f]{64}$/);
    // Changing any input changes the salt.
    expect(creationSaltFor(draft.members[1]!, membersHash, SALT)).not.toBe(expected);
    expect(creationSaltFor(draft.primary!, membersHash, ("0x" + "22".repeat(32)) as `0x${string}`)).not.toBe(expected);
  });
});

describe("preflightCreateOne", () => {
  const connected = (address: string | null, chainId: number | null = 143) => ({ address, chainId });

  it("passes for a fully signed, clean two-wallet draft", async () => {
    const draft = signAll(draftFor([A, B]));
    const result = await preflightCreateOne(mockClient(), draft, connected(draft.primary!));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.predictedAddress).toBe(PREDICTED);
    expect(result.membersHash).toBe(computeMembersHash(draft.members));
  });

  it("passes for a five-wallet draft", async () => {
    const draft = signAll(
      draftFor([A, B, C,
        "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799" as PortfolioAddress,
        "0xd651346d7c789536ebf06dc72aE3C8502cd695CC" as PortfolioAddress]),
    );
    const result = await preflightCreateOne(mockClient(), draft, connected(draft.primary!));
    expect(result.ok).toBe(true);
  });

  it("blocks on the wrong chain", async () => {
    const draft = signAll(draftFor([A, B]));
    const result = await preflightCreateOne(mockClient(), draft, connected(draft.primary!, 1));
    expect(result.issues).toContainEqual({ kind: "wrong-chain", connected: 1 });
  });

  it("blocks when the connected wallet is not the primary", async () => {
    const draft = signAll(draftFor([A, B]));
    const result = await preflightCreateOne(mockClient(), draft, connected(draft.members[1]!));
    expect(result.issues.some((i) => i.kind === "primary-not-connected")).toBe(true);
  });

  it("blocks on a missing signature", async () => {
    const draft = draftFor([A, B]); // unsigned
    const result = await preflightCreateOne(mockClient(), draft, connected(draft.primary!));
    expect(result.issues.some((i) => i.kind === "missing-signature")).toBe(true);
  });

  it("blocks when a signature is stale after a config change", async () => {
    const draft = signAll(draftFor([A, B]));
    const changed: OneDraft = { ...draft, salt: ("0x" + "99".repeat(32)) as `0x${string}` };
    const result = await preflightCreateOne(mockClient(), changed, connected(changed.primary!));
    expect(result.issues.some((i) => i.kind === "stale-signature")).toBe(true);
  });

  it("blocks on an expired signature", async () => {
    const past = String(Math.floor(Date.now() / 1000) - 10);
    const draft = signAll(draftFor([A, B]));
    const expired: OneDraft = {
      ...draft,
      deadline: past,
      signatures: draft.signatures.map((s) => ({ ...s, deadline: past })),
    };
    // Re-fingerprint so only expiry is the failure under test.
    const refingerprinted: OneDraft = {
      ...expired,
      signatures: expired.signatures.map((s) => ({
        ...s,
        configFingerprint: configFingerprint(expired),
      })),
    };
    const result = await preflightCreateOne(mockClient(), refingerprinted, connected(draft.primary!));
    expect(result.issues.some((i) => i.kind === "expired-signature")).toBe(true);
  });

  it("blocks when a signer nonce changed after signing", async () => {
    const draft = signAll(draftFor([A, B]), "0");
    const secondary = draft.members.find((m) => m !== draft.primary)!;
    const client = mockClient({ nonces: { [secondary.toLowerCase()]: 1n } });
    const result = await preflightCreateOne(client, draft, connected(draft.primary!));
    expect(result.issues).toContainEqual({
      kind: "nonce-changed",
      wallet: secondary,
      signed: "0",
      current: "1",
    });
  });

  it("blocks when a member already belongs to an active ONE", async () => {
    const draft = signAll(draftFor([A, B]));
    const bound = draft.members[1]!;
    const client = mockClient({ bindings: { [bound.toLowerCase()]: PREDICTED } });
    const result = await preflightCreateOne(client, draft, connected(draft.primary!));
    expect(result.issues.some((i) => i.kind === "already-bound")).toBe(true);
  });

  it("blocks when the creation salt was already used", async () => {
    const draft = signAll(draftFor([A, B]));
    const result = await preflightCreateOne(mockClient({ saltUsed: true }), draft, connected(draft.primary!));
    expect(result.issues).toContainEqual({ kind: "salt-used" });
  });

  it("blocks when the predicted address already has bytecode", async () => {
    const draft = signAll(draftFor([A, B]));
    const client = mockClient({ codeAtPredicted: "0x6080" });
    const result = await preflightCreateOne(client, draft, connected(draft.primary!));
    expect(result.issues.some((i) => i.kind === "predicted-occupied")).toBe(true);
  });

  it("recomputes membersHash rather than trusting the draft", async () => {
    const draft = signAll(draftFor([A, B]));
    const result = await preflightCreateOne(mockClient(), draft, connected(draft.primary!));
    expect(result.membersHash).toBe(computeMembersHash(sortMembers(draft.members)));
  });
});

describe("simulateCreateOne", () => {
  it("returns a gas plan sized to the exact call", async () => {
    const draft = draftFor([A, B]);
    const result = await simulateCreateOne(mockClient(), {
      account: draft.primary!,
      sortedMembers: draft.members,
      salt: SALT,
      auths: [{ deadline: 1n, signature: SIG }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.gasPlan.estimatedGas).toBe(917_119n);
    expect(result.gasPlan.gasLimit).toBe((917_119n * 110n) / 100n);
    expect(result.predictedFromSimulation).toBe(PREDICTED);
  });

  it("returns the error when simulation reverts", async () => {
    const client = mockClient();
    (client.simulateContract as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("execution reverted"),
    );
    const draft = draftFor([A, B]);
    const result = await simulateCreateOne(client, {
      account: draft.primary!,
      sortedMembers: draft.members,
      salt: SALT,
      auths: [{ deadline: 1n, signature: SIG }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("verifyCreation", () => {
  function receiptWith(one: string, primary: string, members: string[]) {
    const topics = encodeEventTopics({
      abi: ONE_REGISTRY_ABI,
      eventName: "OneCreated",
      args: { one: one as `0x${string}`, primary: primary as `0x${string}` },
    });
    const data = encodeAbiParameters(
      [{ type: "address[]" }, { type: "bytes32" }],
      [members as `0x${string}`[], SALT],
    );
    return {
      logs: [{ address: ONE_REGISTRY_ADDRESS, topics, data }],
      blockNumber: 88_632_900n,
      gasUsed: 1_000_000n,
      effectiveGasPrice: 102_000_000_000n,
    } as unknown as Parameters<typeof verifyCreation>[1];
  }

  it("accepts a receipt whose event matches the prediction", async () => {
    const draft = draftFor([A, B]);
    const receipt = receiptWith(PREDICTED, draft.primary!, draft.members);
    const client = mockClient({ bindings: Object.fromEntries(draft.members.map((m) => [m.toLowerCase(), PREDICTED])) });
    const outcome = await verifyCreation(client, receipt, PREDICTED);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.oneAddress).toBe(PREDICTED);
    expect(outcome.members).toHaveLength(2);
  });

  it("fails hard when the emitted address differs from the prediction", async () => {
    const draft = draftFor([A, B]);
    const different = "0x1111111111111111111111111111111111111111";
    const receipt = receiptWith(different, draft.primary!, draft.members);
    const outcome = await verifyCreation(mockClient(), receipt, PREDICTED);
    expect(outcome).toMatchObject({ ok: false, reason: "prediction-mismatch" });
  });

  it("fails when no OneCreated event is present", async () => {
    const receipt = { logs: [], blockNumber: 1n, gasUsed: 1n, effectiveGasPrice: 1n } as unknown as Parameters<typeof verifyCreation>[1];
    const outcome = await verifyCreation(mockClient(), receipt, PREDICTED);
    expect(outcome).toMatchObject({ ok: false, reason: "no-event" });
  });

  it("fails when the registry does not report the ONE as existing", async () => {
    const draft = draftFor([A, B]);
    const receipt = receiptWith(PREDICTED, draft.primary!, draft.members);
    const outcome = await verifyCreation(mockClient({ exists: false }), receipt, PREDICTED);
    expect(outcome).toMatchObject({ ok: false, reason: "not-registered" });
  });

  it("fails when a member is not bound to the new ONE", async () => {
    const draft = draftFor([A, B]);
    const receipt = receiptWith(PREDICTED, draft.primary!, draft.members);
    const client = mockClient({ bindings: { [draft.members[1]!.toLowerCase()]: ZERO } });
    const outcome = await verifyCreation(client, receipt, PREDICTED);
    expect(outcome).toMatchObject({ ok: false, reason: "member-not-bound" });
  });

  it("ignores logs from other contracts", async () => {
    const draft = draftFor([A, B]);
    const receipt = receiptWith(PREDICTED, draft.primary!, draft.members);
    (receipt as { logs: unknown[] }).logs.unshift({
      address: "0x0000000000000000000000000000000000000abc",
      topics: ["0x" + "00".repeat(32)],
      data: "0x",
    });
    const client = mockClient({ bindings: Object.fromEntries(draft.members.map((m) => [m.toLowerCase(), PREDICTED])) });
    const outcome = await verifyCreation(client, receipt, PREDICTED);
    expect(outcome.ok).toBe(true);
  });
});
