/**
 * Provider-independent NFT data access.
 *
 * Two adapters here are real and tested end-to-end against Monad Mainnet:
 *   - OnChainScopedProvider  — plain RPC, no third party, no key
 *   - SequenceScopedProvider — Sequence's public Monad indexer, no key
 *
 * The rest are real request builders for key-gated services. They are NOT fake
 * adapters: none of them fabricates a result. Without a credential each one
 * throws {@link ProviderBlockedError} carrying the exact command needed to
 * reproduce the test once a key exists.
 *
 * IMPORTANT LIMITATION, measured not assumed: neither keyless adapter can
 * *enumerate* a wallet's NFTs. Both answer "how many of collection X does this
 * wallet hold", which requires the caller to supply candidate collections. See
 * results/REPORT.md for the evidence.
 */

import {
  getAddress,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { MONAD_CHAIN_ID } from "./rpc.js";

export type WalletNft = {
  chainId: 143;
  collectionAddress: `0x${string}`;
  tokenId: string;
  owner: `0x${string}`;
  collectionName: string | null;
  tokenName: string | null;
  imageUrl: string | null;
};

export interface NftDataProvider {
  readonly name: string;
  /** True when this provider can list NFTs without being told which collections to check. */
  readonly canEnumerateWalletWide: boolean;
  getWalletNfts(address: `0x${string}`): Promise<WalletNft[]>;
}

export class ProviderBlockedError extends Error {
  constructor(
    readonly provider: string,
    readonly missingCredential: string,
    readonly reproduceCommand: string,
  ) {
    super(`${provider} BLOCKED: missing ${missingCredential}`);
    this.name = "ProviderBlockedError";
  }
}

const ERC721_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function name() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

/** ERC-721 Enumerable interface id. */
const ERC721_ENUMERABLE = "0x780e9d63" as const;

// ---------------------------------------------------------------------------
// On-chain, collection-scoped. No third party, no key, no rate limit beyond RPC.
// ---------------------------------------------------------------------------

export class OnChainScopedProvider implements NftDataProvider {
  readonly name = "on-chain-rpc (collection-scoped)";
  readonly canEnumerateWalletWide = false;

  constructor(
    private readonly client: PublicClient,
    private readonly collections: Address[],
  ) {}

  async getWalletNfts(address: `0x${string}`): Promise<WalletNft[]> {
    const owner = getAddress(address);
    const out: WalletNft[] = [];

    for (const raw of this.collections) {
      const collection = getAddress(raw);

      // balanceOf is the authoritative ownership count. A failure here must
      // propagate — an unreachable collection is not a collection with zero.
      const balance = (await this.client.readContract({
        address: collection,
        abi: ERC721_ABI,
        functionName: "balanceOf",
        args: [owner],
      })) as bigint;

      if (balance === 0n) continue;

      const collectionName = await this.client
        .readContract({ address: collection, abi: ERC721_ABI, functionName: "name" })
        .then((n) => n as string)
        .catch(() => null);

      // Token IDs are only listable if the collection is ERC721Enumerable.
      const enumerable = await this.client
        .readContract({
          address: collection,
          abi: ERC721_ABI,
          functionName: "supportsInterface",
          args: [ERC721_ENUMERABLE],
        })
        .catch(() => false);

      if (!enumerable) {
        // Record the holding without token IDs rather than dropping it.
        out.push({
          chainId: MONAD_CHAIN_ID,
          collectionAddress: collection,
          tokenId: `unknown:${balance.toString()}-held`,
          owner,
          collectionName,
          tokenName: null,
          imageUrl: null,
        });
        continue;
      }

      const capped = balance > 50n ? 50n : balance;
      for (let i = 0n; i < capped; i++) {
        try {
          const tokenId = (await this.client.readContract({
            address: collection,
            abi: ERC721_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [owner, i],
          })) as bigint;

          const uri = await this.client
            .readContract({
              address: collection,
              abi: ERC721_ABI,
              functionName: "tokenURI",
              args: [tokenId],
            })
            .then((u) => u as string)
            .catch(() => null);

          out.push({
            chainId: MONAD_CHAIN_ID,
            collectionAddress: collection,
            tokenId: tokenId.toString(),
            owner,
            collectionName,
            tokenName: null,
            imageUrl: uri,
          });
        } catch {
          break;
        }
      }
    }

    return out;
  }
}

// ---------------------------------------------------------------------------
// Sequence public Monad indexer. Keyless, but collection-scoped only.
// ---------------------------------------------------------------------------

export const SEQUENCE_MONAD_INDEXER = "https://monad-indexer.sequence.app" as const;

type SequenceBalance = {
  contractType?: string;
  contractAddress?: string;
  accountAddress?: string;
  tokenID?: string;
  balance?: string;
  contractInfo?: { name?: string; symbol?: string };
  tokenMetadata?: { name?: string; image?: string };
};

export class SequenceScopedProvider implements NftDataProvider {
  readonly name = "sequence-indexer (collection-scoped)";
  readonly canEnumerateWalletWide = false;

  constructor(private readonly collections: Address[]) {}

  static async rpc(
    method: string,
    body: unknown,
  ): Promise<{ status: number; ms: number; json: unknown }> {
    const started = performance.now();
    const res = await fetch(`${SEQUENCE_MONAD_INDEXER}/rpc/Indexer/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, ms: Math.round(performance.now() - started), json };
  }

  async getWalletNfts(address: `0x${string}`): Promise<WalletNft[]> {
    const owner = getAddress(address);
    const out: WalletNft[] = [];

    for (const raw of this.collections) {
      const collection = getAddress(raw);
      const { status, json } = await SequenceScopedProvider.rpc("GetTokenBalancesByContract", {
        filter: { accountAddresses: [owner], contractAddresses: [collection] },
        includeMetadata: true,
      });
      if (status !== 200) {
        throw new Error(`Sequence GetTokenBalancesByContract HTTP ${status}`);
      }
      const balances = (json as { balances?: SequenceBalance[] }).balances ?? [];
      for (const b of balances) {
        if (b.contractType !== "ERC721") continue;
        if (!b.contractAddress || b.tokenID === undefined) continue;
        const image = b.tokenMetadata?.image;
        const tokenName = b.tokenMetadata?.name;
        out.push({
          chainId: MONAD_CHAIN_ID,
          collectionAddress: getAddress(b.contractAddress as `0x${string}`),
          tokenId: String(b.tokenID),
          owner,
          collectionName: b.contractInfo?.name || null,
          tokenName: tokenName && tokenName.length > 0 ? tokenName : null,
          imageUrl: image && image.length > 0 ? image : null,
        });
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Key-gated providers. Real requests; blocked without credentials.
// ---------------------------------------------------------------------------

export class ThirdwebInsightProvider implements NftDataProvider {
  readonly name = "thirdweb-insight";
  readonly canEnumerateWalletWide = true;

  constructor(private readonly clientId: string | undefined) {}

  async getWalletNfts(address: `0x${string}`): Promise<WalletNft[]> {
    const url = `https://${MONAD_CHAIN_ID}.insight.thirdweb.com/v1/nfts?owner_address=${address}&limit=50`;
    if (!this.clientId) {
      throw new ProviderBlockedError(
        this.name,
        "THIRDWEB_CLIENT_ID",
        `curl -H "x-client-id: $THIRDWEB_CLIENT_ID" "${url}"`,
      );
    }
    const res = await fetch(url, { headers: { "x-client-id": this.clientId } });
    if (!res.ok) throw new Error(`thirdweb Insight HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        contract_address?: string;
        token_id?: string;
        name?: string;
        image_url?: string;
        collection?: { name?: string };
      }>;
    };
    return (json.data ?? []).map((n) => ({
      chainId: MONAD_CHAIN_ID,
      collectionAddress: getAddress((n.contract_address ?? "0x") as `0x${string}`),
      tokenId: String(n.token_id ?? ""),
      owner: getAddress(address),
      collectionName: n.collection?.name ?? null,
      tokenName: n.name ?? null,
      imageUrl: n.image_url ?? null,
    }));
  }
}

export class BlockVisionProvider implements NftDataProvider {
  readonly name = "blockvision";
  readonly canEnumerateWalletWide = true;

  constructor(private readonly apiKey: string | undefined) {}

  async getWalletNfts(address: `0x${string}`): Promise<WalletNft[]> {
    const url = `https://api.blockvision.org/v2/monad/account/nfts?address=${address}&pageIndex=1`;
    if (!this.apiKey) {
      throw new ProviderBlockedError(
        this.name,
        "BLOCKVISION_API_KEY",
        `curl -H "x-api-key: $BLOCKVISION_API_KEY" "${url}"`,
      );
    }
    const res = await fetch(url, { headers: { "x-api-key": this.apiKey } });
    if (!res.ok) throw new Error(`BlockVision HTTP ${res.status}`);
    const json = (await res.json()) as {
      result?: { data?: Array<{ contractAddress?: string; tokenId?: string; name?: string; image?: string; collectionName?: string }> };
    };
    return (json.result?.data ?? []).map((n) => ({
      chainId: MONAD_CHAIN_ID,
      collectionAddress: getAddress((n.contractAddress ?? "0x") as `0x${string}`),
      tokenId: String(n.tokenId ?? ""),
      owner: getAddress(address),
      collectionName: n.collectionName ?? null,
      tokenName: n.name ?? null,
      imageUrl: n.image ?? null,
    }));
  }
}

export class EtherscanV2Provider implements NftDataProvider {
  readonly name = "etherscan-v2 (monadscan)";
  readonly canEnumerateWalletWide = true;

  constructor(private readonly apiKey: string | undefined) {}

  async getWalletNfts(address: `0x${string}`): Promise<WalletNft[]> {
    const url =
      `https://api.etherscan.io/v2/api?chainid=${MONAD_CHAIN_ID}` +
      `&module=account&action=addresstokennftbalance&address=${address}&page=1&offset=100`;
    if (!this.apiKey) {
      throw new ProviderBlockedError(
        this.name,
        "ETHERSCAN_API_KEY (note: addresstokennftbalance is an Etherscan PRO endpoint)",
        `curl "${url}&apikey=$ETHERSCAN_API_KEY"`,
      );
    }
    const res = await fetch(`${url}&apikey=${this.apiKey}`);
    if (!res.ok) throw new Error(`Etherscan V2 HTTP ${res.status}`);
    const json = (await res.json()) as {
      status?: string;
      result?: unknown;
    };
    if (json.status !== "1" || !Array.isArray(json.result)) {
      throw new Error(`Etherscan V2: ${JSON.stringify(json.result).slice(0, 160)}`);
    }
    return (json.result as Array<{ TokenAddress?: string; TokenId?: string; TokenName?: string }>).map(
      (n) => ({
        chainId: MONAD_CHAIN_ID,
        collectionAddress: getAddress((n.TokenAddress ?? "0x") as `0x${string}`),
        tokenId: String(n.TokenId ?? ""),
        owner: getAddress(address),
        collectionName: n.TokenName ?? null,
        tokenName: null,
        imageUrl: null,
      }),
    );
  }
}

export class RaribleProvider implements NftDataProvider {
  readonly name = "rarible";
  readonly canEnumerateWalletWide = true;

  constructor(private readonly apiKey: string | undefined) {}

  async getWalletNfts(address: `0x${string}`): Promise<WalletNft[]> {
    const url = `https://api.rarible.org/v0.1/items/byOwner?owner=MONAD:${address}&size=50`;
    if (!this.apiKey) {
      throw new ProviderBlockedError(
        this.name,
        "RARIBLE_API_KEY",
        `curl -H "X-API-KEY: $RARIBLE_API_KEY" "${url}"`,
      );
    }
    const res = await fetch(url, { headers: { "X-API-KEY": this.apiKey } });
    if (!res.ok) throw new Error(`Rarible HTTP ${res.status}`);
    const json = (await res.json()) as {
      items?: Array<{ contract?: string; tokenId?: string; meta?: { name?: string; content?: Array<{ url?: string }> } }>;
    };
    return (json.items ?? []).map((n) => {
      const contract = (n.contract ?? "").split(":").pop() ?? "0x";
      return {
        chainId: MONAD_CHAIN_ID,
        collectionAddress: getAddress(contract as `0x${string}`),
        tokenId: String(n.tokenId ?? ""),
        owner: getAddress(address),
        collectionName: null,
        tokenName: n.meta?.name ?? null,
        imageUrl: n.meta?.content?.[0]?.url ?? null,
      };
    });
  }
}
