import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { discoverAndVerifyFungibles } from "./discover";
import type { AssetDiscoveryProvider } from "./provider";
import type { DiscoveryStatus } from "./types";
import type { PortfolioAddress } from "@/lib/types";

const W = "0x017F9358AFcC7018dd683001FD33fD7D68230D8B" as PortfolioAddress;
// Verify is only exercised for candidate lists; empty candidates skip multicall,
// so a client that only answers getBlockNumber is enough to test selection.
const client = { getBlockNumber: async () => 1n } as unknown as PublicClient;

function provider(
  name: string,
  status: DiscoveryStatus,
  configured = true,
): AssetDiscoveryProvider {
  return {
    name,
    configured,
    async discover() {
      return {
        fungibles: [],
        nfts: [],
        status,
        failures:
          status === "unavailable"
            ? [{ scope: "wallet" as const, reason: "down", blocked: true }]
            : [],
        context: { provider: name },
        candidatesConsidered: 0,
      };
    },
  };
}

describe("discoverAndVerifyFungibles — provider selection & fallback", () => {
  it("uses curated by default (flag off)", async () => {
    const res = await discoverAndVerifyFungibles(client, [W], {
      flag: "curated",
      envio: provider("envio", "complete"),
      curated: provider("curated", "complete"),
    });
    expect(res.source).toBe("curated");
    expect(res.status).toBe("complete");
  });

  it("uses envio when the flag is on and it is configured", async () => {
    const res = await discoverAndVerifyFungibles(client, [W], {
      flag: "envio",
      envio: provider("envio", "complete"),
      curated: provider("curated", "complete"),
    });
    expect(res.source).toBe("envio");
    expect(res.status).toBe("complete");
  });

  it("falls back to curated (partial + honest note) when envio is unavailable", async () => {
    const res = await discoverAndVerifyFungibles(client, [W], {
      flag: "envio",
      envio: provider("envio", "unavailable"),
      curated: provider("curated", "complete"),
    });
    expect(res.source).toBe("curated");
    expect(res.status).toBe("partial");
    expect(res.failures.some((f) => f.scope === "provider" && /unavailable/i.test(f.reason))).toBe(
      true,
    );
  });

  it("uses curated when envio is selected but unconfigured (no token)", async () => {
    const res = await discoverAndVerifyFungibles(client, [W], {
      flag: "envio",
      envio: provider("envio", "complete", false),
      curated: provider("curated", "complete"),
    });
    expect(res.source).toBe("curated");
    expect(res.status).toBe("complete");
  });
});
