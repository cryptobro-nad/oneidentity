import { describe, expect, it } from "vitest";
import { V2_LINK_COPY, V2_MANAGE_COPY, formatCountdown } from "./copy";

/** Flattens a copy object's string values (calling any string-returning fns). */
function flatten(obj: Record<string, unknown>): string {
  return Object.values(obj)
    .map((v) => (typeof v === "function" ? (v as (s: string) => string)("00:00") : String(v)))
    .join(" ")
    .toLowerCase();
}

describe("V2 link copy", () => {
  it("uses the approved funds statement verbatim", () => {
    expect(V2_LINK_COPY.fundsNote).toBe(
      "You send a small amount of MON from the secondary wallet to your own primary wallet. ONE never receives, holds, forwards, or controls it. The amount stays in your primary wallet.",
    );
  });

  it("never claims 'No funds move'", () => {
    expect(flatten(V2_LINK_COPY)).not.toContain("no funds move");
  });

  it("hides technical terms from all user-facing copy", () => {
    const terms = ["attestation", "verifier", "indexer", "eip-712", "eip712", "challenge", "nonce", "signature payload"];
    const surfaces = flatten(V2_LINK_COPY) + " " + flatten(V2_MANAGE_COPY);
    for (const term of terms) expect(surfaces).not.toContain(term);
  });
});

describe("formatCountdown", () => {
  it("formats seconds as mm:ss and clamps at zero", () => {
    expect(formatCountdown(300)).toBe("5:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(-10)).toBe("0:00");
  });
});
