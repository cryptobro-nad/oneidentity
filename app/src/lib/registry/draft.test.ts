import { describe, expect, it } from "vitest";
import {
  clearDraft,
  configFingerprint,
  emptyDraft,
  loadDraft,
  pruneInvalidSignatures,
  saveDraft,
  signatureStatusFor,
  upsertSignature,
  type CollectedSignature,
  type OneDraft,
} from "./draft";
import { sortMembers } from "./members";
import type { PortfolioAddress } from "@/lib/types";

const A = "0xB09684f5486d1af80699BbC27f14dd5A905da873" as PortfolioAddress;
const B = "0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1" as PortfolioAddress;
const C = "0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946" as PortfolioAddress;

const SALT_1 = ("0x" + "11".repeat(32)) as `0x${string}`;
const SALT_2 = ("0x" + "22".repeat(32)) as `0x${string}`;
const FUTURE = String(Math.floor(Date.now() / 1000) + 3600);

function draftWith(overrides: Partial<OneDraft> = {}): OneDraft {
  const members = sortMembers([A, B]);
  return {
    ...emptyDraft(),
    members,
    primary: members[0]!,
    salt: SALT_1,
    deadline: FUTURE,
    ...overrides,
  };
}

function signatureFor(draft: OneDraft, wallet: PortfolioAddress, overrides: Partial<CollectedSignature> = {}): CollectedSignature {
  return {
    wallet,
    signature: ("0x" + "ab".repeat(65)) as `0x${string}`,
    nonce: "0",
    deadline: draft.deadline!,
    configFingerprint: configFingerprint(draft),
    signedAt: Date.now(),
    ...overrides,
  };
}

describe("configFingerprint", () => {
  it("is stable for an unchanged configuration", () => {
    const draft = draftWith();
    expect(configFingerprint(draft)).toBe(configFingerprint({ ...draft }));
  });

  it("ignores the order members were entered in", () => {
    const one = draftWith({ members: sortMembers([A, B]) });
    const two = draftWith({ members: sortMembers([B, A]) });
    expect(configFingerprint(one)).toBe(configFingerprint(two));
  });

  it("changes when the member list changes", () => {
    const base = draftWith();
    const changed = draftWith({ members: sortMembers([A, B, C]) });
    expect(configFingerprint(changed)).not.toBe(configFingerprint(base));
  });

  it("changes when the primary changes", () => {
    const base = draftWith();
    const changed = { ...base, primary: base.members[1]! };
    expect(configFingerprint(changed)).not.toBe(configFingerprint(base));
  });

  it("changes when the salt changes", () => {
    const base = draftWith();
    expect(configFingerprint({ ...base, salt: SALT_2 })).not.toBe(configFingerprint(base));
  });

  it("changes when the deadline changes", () => {
    const base = draftWith();
    expect(configFingerprint({ ...base, deadline: "999" })).not.toBe(configFingerprint(base));
  });

  it("does NOT change when a signature is added", () => {
    // Signatures are outputs of the config, not inputs to it. Including them
    // would make every signature invalidate all the others.
    const base = draftWith();
    const withSig = upsertSignature(base, signatureFor(base, base.members[1]!));
    expect(configFingerprint(withSig)).toBe(configFingerprint(base));
  });
});

describe("signatureStatusFor", () => {
  it("reports missing when the wallet has not signed", () => {
    expect(signatureStatusFor(draftWith(), B).state).toBe("missing");
  });

  it("reports valid for a fresh matching signature", () => {
    const draft = draftWith();
    const secondary = draft.members[1]!;
    const withSig = upsertSignature(draft, signatureFor(draft, secondary));
    expect(signatureStatusFor(withSig, secondary).state).toBe("valid");
  });

  it("reports stale-config after the member list changes", () => {
    const draft = draftWith();
    const secondary = draft.members[1]!;
    const withSig = upsertSignature(draft, signatureFor(draft, secondary));
    const changed = { ...withSig, members: sortMembers([A, B, C]) };
    expect(signatureStatusFor(changed, secondary).state).toBe("stale-config");
  });

  it("reports stale-config after the primary changes", () => {
    const draft = draftWith();
    const secondary = draft.members[1]!;
    const withSig = upsertSignature(draft, signatureFor(draft, secondary));
    const changed = { ...withSig, primary: draft.members[1]! };
    expect(signatureStatusFor(changed, secondary).state).toBe("stale-config");
  });

  it("reports stale-config after the salt changes", () => {
    const draft = draftWith();
    const secondary = draft.members[1]!;
    const withSig = upsertSignature(draft, signatureFor(draft, secondary));
    expect(signatureStatusFor({ ...withSig, salt: SALT_2 }, secondary).state).toBe("stale-config");
  });

  it("reports expired once the deadline has passed", () => {
    const past = String(Math.floor(Date.now() / 1000) - 10);
    const draft = draftWith({ deadline: past });
    const secondary = draft.members[1]!;
    const withSig = upsertSignature(draft, signatureFor(draft, secondary, { deadline: past }));
    expect(signatureStatusFor(withSig, secondary).state).toBe("expired");
  });
});

describe("pruneInvalidSignatures", () => {
  it("keeps a valid signature", () => {
    const draft = draftWith();
    const withSig = upsertSignature(draft, signatureFor(draft, draft.members[1]!));
    const { draft: pruned, invalidated } = pruneInvalidSignatures(withSig);
    expect(pruned.signatures).toHaveLength(1);
    expect(invalidated).toHaveLength(0);
  });

  it("drops every signature when the member list changes", () => {
    const draft = draftWith({ members: sortMembers([A, B, C]) });
    const primary = draft.members[0]!;
    let withSigs: OneDraft = { ...draft, primary };
    for (const m of draft.members.filter((x) => x !== primary)) {
      withSigs = upsertSignature(withSigs, signatureFor(withSigs, m));
    }
    expect(withSigs.signatures).toHaveLength(2);

    const changed = { ...withSigs, members: sortMembers([A, B]) };
    const { draft: pruned, invalidated } = pruneInvalidSignatures(changed);
    expect(pruned.signatures).toHaveLength(0);
    expect(invalidated).toHaveLength(2);
  });

  it("drops the signature of a wallet promoted to primary", () => {
    const draft = draftWith();
    const secondary = draft.members[1]!;
    const withSig = upsertSignature(draft, signatureFor(draft, secondary));
    // The primary never signs; a leftover signature must not survive.
    const promoted = { ...withSig, primary: secondary };
    const { draft: pruned } = pruneInvalidSignatures(promoted);
    expect(pruned.signatures).toHaveLength(0);
  });

  it("drops the signature of a wallet removed from the set", () => {
    const draft = draftWith({ members: sortMembers([A, B, C]) });
    const primary = draft.members[0]!;
    const removed = draft.members[2]!;
    let withSigs: OneDraft = { ...draft, primary };
    withSigs = upsertSignature(withSigs, signatureFor(withSigs, removed));

    const shrunk = { ...withSigs, members: draft.members.filter((m) => m !== removed) };
    const { draft: pruned } = pruneInvalidSignatures(shrunk);
    expect(pruned.signatures).toHaveLength(0);
  });

  it("drops expired signatures", () => {
    const past = String(Math.floor(Date.now() / 1000) - 10);
    const draft = draftWith({ deadline: past });
    const withSig = upsertSignature(draft, signatureFor(draft, draft.members[1]!, { deadline: past }));
    const { draft: pruned, invalidated } = pruneInvalidSignatures(withSig);
    expect(pruned.signatures).toHaveLength(0);
    expect(invalidated).toHaveLength(1);
  });
});

describe("upsertSignature", () => {
  it("replaces an existing signature for the same wallet", () => {
    const draft = draftWith();
    const secondary = draft.members[1]!;
    const first = upsertSignature(draft, signatureFor(draft, secondary, { nonce: "0" }));
    const second = upsertSignature(first, signatureFor(draft, secondary, { nonce: "1" }));
    expect(second.signatures).toHaveLength(1);
    expect(second.signatures[0]!.nonce).toBe("1");
  });

  it("is case-insensitive on the wallet", () => {
    const draft = draftWith();
    const secondary = draft.members[1]!;
    const first = upsertSignature(draft, signatureFor(draft, secondary));
    const second = upsertSignature(
      first,
      signatureFor(draft, secondary.toLowerCase() as PortfolioAddress),
    );
    expect(second.signatures).toHaveLength(1);
  });
});

describe("draft persistence", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      size: () => store.size,
    };
  }

  it("round-trips a draft with a valid signature", () => {
    const storage = memoryStorage();
    const draft = draftWith();
    const withSig = upsertSignature(draft, signatureFor(draft, draft.members[1]!));
    saveDraft(withSig, storage);
    const loaded = loadDraft(storage);
    expect(loaded?.signatures).toHaveLength(1);
  });

  it("prunes expired signatures on load", () => {
    const storage = memoryStorage();
    const past = String(Math.floor(Date.now() / 1000) - 10);
    const draft = draftWith({ deadline: past });
    const withSig = upsertSignature(draft, signatureFor(draft, draft.members[1]!, { deadline: past }));
    saveDraft(withSig, storage);
    expect(loadDraft(storage)?.signatures).toHaveLength(0);
  });

  it("clears the draft", () => {
    const storage = memoryStorage();
    saveDraft(draftWith(), storage);
    clearDraft(storage);
    expect(loadDraft(storage)).toBeNull();
  });

  it("survives malformed stored JSON", () => {
    expect(loadDraft(memoryStorage({ "one.verified.draft.v1": "{oops" }))).toBeNull();
  });

  it("is a no-op without storage (SSR)", () => {
    expect(loadDraft(undefined)).toBeNull();
    expect(() => saveDraft(draftWith(), undefined)).not.toThrow();
    expect(() => clearDraft(undefined)).not.toThrow();
  });
});
