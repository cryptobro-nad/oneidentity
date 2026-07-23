/**
 * Curated fallback discovery provider.
 *
 * Wraps the existing hand-verified token list as candidates in the new
 * interface, so the dynamic pipeline degrades to exactly today's coverage when
 * Envio is unavailable, unconfigured, or the flag is off. It "discovers"
 * nothing new — verification (`verifyFungibles`) still runs on-chain.
 */

import { getAddress } from "viem";
import { MONAD_CHAIN_ID } from "@/lib/chain";
import { ALL_BALANCE_TOKENS, type BalanceToken } from "@/lib/tokens";
import type { PortfolioAddress } from "@/lib/types";
import type { AssetDiscoveryProvider } from "../provider";
import type { DiscoveryResult, FungibleCandidate } from "../types";

export class CuratedAssetProvider implements AssetDiscoveryProvider {
  readonly name = "curated";
  readonly configured = true;

  constructor(private readonly tokens: readonly BalanceToken[] = ALL_BALANCE_TOKENS) {}

  async discover(wallets: readonly PortfolioAddress[]): Promise<DiscoveryResult> {
    const walletList = wallets.map((w) => getAddress(w) as PortfolioAddress);
    const fungibles: FungibleCandidate[] = this.tokens.map((t) => ({
      chainId: MONAD_CHAIN_ID,
      contractAddress: getAddress(t.address) as PortfolioAddress,
      standard: "erc20",
      wallets: walletList,
      source: "curated",
    }));
    return {
      fungibles,
      nfts: [],
      status: "complete",
      failures: [],
      context: { provider: this.name },
      candidatesConsidered: fungibles.length,
    };
  }
}
