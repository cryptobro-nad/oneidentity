import { describe, expect, it } from "vitest";
import { V2_LINK_COPY } from "./copy";

describe("V2 link copy", () => {
  it("uses the approved funds statement verbatim", () => {
    expect(V2_LINK_COPY.fundsNote).toBe(
      "You send a small amount of MON from the secondary wallet to your own primary wallet. ONE never receives, holds, forwards, or controls it. The amount stays in your primary wallet.",
    );
  });

  it("never claims 'No funds move'", () => {
    const all = Object.values(V2_LINK_COPY).join(" ").toLowerCase();
    expect(all).not.toContain("no funds move");
  });
});
