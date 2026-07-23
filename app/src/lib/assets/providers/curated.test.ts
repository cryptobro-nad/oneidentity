import { describe, expect, it } from "vitest";
import { CuratedAssetProvider } from "./curated";
import { ALL_BALANCE_TOKENS } from "@/lib/tokens";
import type { PortfolioAddress } from "@/lib/types";

const W = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;

describe("CuratedAssetProvider", () => {
  it("proposes every curated token as an erc20 candidate for the wallets", async () => {
    const res = await new CuratedAssetProvider().discover([W]);
    expect(res.status).toBe("complete");
    expect(res.fungibles).toHaveLength(ALL_BALANCE_TOKENS.length);
    expect(res.fungibles.every((f) => f.standard === "erc20" && f.source === "curated")).toBe(true);
    expect(res.fungibles.every((f) => f.wallets.length === 1)).toBe(true);
    expect(res.nfts).toHaveLength(0);
    expect(res.failures).toHaveLength(0);
  });
});
