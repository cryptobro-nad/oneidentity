import { describe, expect, it } from "vitest";
import { resolveDiscoveryProvider } from "./config";

describe("resolveDiscoveryProvider", () => {
  it("defaults to curated when unset", () => {
    expect(resolveDiscoveryProvider({})).toBe("curated");
  });
  it("selects envio only when explicitly set", () => {
    expect(resolveDiscoveryProvider({ ASSET_DISCOVERY_PROVIDER: "envio" })).toBe("envio");
  });
  it("falls back to curated for any unknown value", () => {
    expect(resolveDiscoveryProvider({ ASSET_DISCOVERY_PROVIDER: "blockvision" })).toBe("curated");
    expect(resolveDiscoveryProvider({ ASSET_DISCOVERY_PROVIDER: "" })).toBe("curated");
  });
});
