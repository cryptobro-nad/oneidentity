# ONE — Monad Mainnet Data Infrastructure Spike

**Status legend used throughout:**

| Tag | Meaning |
|---|---|
| ✅ **EXECUTED** | A real request was made and succeeded; numbers below are live output |
| 📄 **DOCUMENTED** | Verified from current official documentation, not independently executed |
| 🔍 **INFERRED** | A conclusion drawn from evidence, not directly stated by a source |
| 🔒 **BLOCKED** | Could not be tested — missing credential. Exact repro command given |
| ❌ **FAILED** | Executed and did not work |

---

## 1. Date and time of tests

| | |
|---|---|
| Test run started | **2026-07-18T18:21:26.283Z** |
| Test run finished | **2026-07-18T18:22:18.807Z** |
| Provider probing (separate) | 2026-07-18T18:05–18:20 UTC |
| Runtime | Node v24.14.1, viem 2.55.2 |
| Machine | Windows 11, residential connection — latencies include real WAN RTT |

Raw machine-readable output: [`spike-output.json`](./spike-output.json).

---

## 2. RPC endpoints tested

All five endpoints listed in the official Monad docs were tested. 📄 Source:
<https://docs.monad.xyz/developer-essentials/network-information>

✅ **EXECUTED** — five sequential `eth_blockNumber` samples per endpoint, plus an
escalating batch probe (2 → 5 → 10 → 20 → 50 → 100 → 150).

| Endpoint | Provider | Responded | Chain ID | Median latency | Samples (ms) | Batching | Max batch observed | Docs batch limit |
|---|---|---|---|---|---|---|---|---|
| `https://rpc.monad.xyz` | QuickNode | ✅ | 143 | **57 ms** | 163, 61, 57, 55, 54 | ✅ | **20** | 100 |
| `https://rpc1.monad.xyz` | Alchemy | ✅ | 143 | 75 ms | 150, 73, 70, 75, 77 | ✅ | **150** | 100 |
| `https://rpc2.monad.xyz` | Goldsky Edge | ⚠️ | — | — | — | — | — | 10 |
| `https://rpc3.monad.xyz` | Ankr | ✅ | 143 | **62 ms** | 59, 67, 62, 60, 68 | ✅ | **10** | 10 |
| `https://rpc-mainnet.monadinfra.com` | Monad Foundation | ✅ | 143 | 86 ms | 162, 86, 81, 98, 76 | ❌ | 1 | 1 |

**Notes on discrepancies between docs and measurement** 🔍

- `rpc.monad.xyz` documents a batch limit of 100 but **stopped returning complete
  batches above 20** in this run. Treat 20 as the practical ceiling, not 100.
- `rpc1.monad.xyz` documents 100 but accepted **150** — the doc figure is
  conservative there.
- `rpc-mainnet.monadinfra.com` genuinely does not batch, matching its documented
  limit of 1.
- `rpc2.monad.xyz` returned **HTTP 429 (rate limited)** on the first of two runs
  and succeeded on the second (125 ms median, batch 150). It is functional but
  the most rate-limit-sensitive of the set. ⚠️ Not recommended as primary.

**`eth_getLogs` block-range ceiling** ✅ EXECUTED — measured directly, not documented anywhere:

| Window | Result |
|---|---|
| 200 blocks | ❌ `RPC Request failed` |
| 100 blocks | ✅ 130 logs, 68 ms |
| 50 blocks | ✅ 83 logs, 64 ms |

→ **100 blocks is the hard ceiling on `rpc.monad.xyz`.** Any log-scanning code
must window at ≤100. This is not in the docs and would have been a production bug.

### Chosen endpoints

- **Primary: `https://rpc.monad.xyz`** (QuickNode) — fastest median, 25 rps.
- **Fallback: `https://rpc3.monad.xyz`** (Ankr) — 62 ms, and its 300-per-10s
  budget is more forgiving than the primary's 25 rps for burst traffic.

---

## 3. Live chain ID and block number

✅ **EXECUTED**

| | |
|---|---|
| Chain ID returned by every healthy endpoint | **143** (`0x8f`) |
| Native currency | **MON**, 18 decimals |
| Head block at probe time | **88,613,282** |
| Block pinned for all balance reads | **88,613,299** |
| Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` | ✅ **code present, confirmed deployed** |

Explorers 📄 **DOCUMENTED**: MonadVision <https://monadvision.com>, Monadscan
<https://monadscan.com>. Monadscan is Etherscan-V2 backed (see §10).

---

## 4. RPC latency and batching results

See the table in §2. Headline comparison from the aggregation test:

| Strategy | Wall time | Calls |
|---|---|---|
| Individual sequential calls | **1,248 ms** | 5 native + 15 `balanceOf` = 20 round-trips |
| Multicall3 (+ JSON-RPC batching for native) | **106 ms** | 1 aggregate + 5 batched |

→ **Multicall3 is ~11.8× faster** for a five-wallet, three-token portfolio, and
both returned **byte-identical values** (§9). This is the single most important
performance finding: ONE's portfolio view must use Multicall3.

---

## 5. Stablecoin source references

📄 **DOCUMENTED** — official Monad token list, fetched live during the run:

- Repo: <https://github.com/monad-crypto/token-list>
- Raw: <https://raw.githubusercontent.com/monad-crypto/token-list/refs/heads/main/tokenlist-mainnet.json>
- List name: `Monad Mainnet` · **version 2.45.1** · timestamp **2026-07-02T15:44:07Z** · **98 tokens**

All three required stablecoins were present in this list at the addresses below,
and every address was independently re-verified against the chain.

---

## 6. Stablecoin addresses (confirmed configuration)

```typescript
type SupportedStablecoin = {
  chainId: 143;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
};
```

| Symbol | Address | Decimals | In official list | Verdict |
|---|---|---|---|---|
| **USDC** | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | 6 | ✅ | ✅ SAFE_FOR_PROTOTYPE |
| **USDT0** | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | 6 | ✅ | ✅ SAFE_FOR_PROTOTYPE |
| **AUSD** | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` | 6 | ✅ | ✅ SAFE_FOR_PROTOTYPE |

**Not configured**, tested and reported only, per instruction:

| Symbol | Address | Decimals | Verdict |
|---|---|---|---|
| mUSD (MetaMask USD) | `0xacA92E438df0B2401fF60dA7E4337B687a2435DA` | 6 | ✅ passes all checks — **awaiting your explicit approval before adding** |

---

## 7. Live metadata-call results

✅ **EXECUTED** — real `name()` / `symbol()` / `decimals()` / `totalSupply()` /
`balanceOf()` calls plus raw storage reads of the EIP-1967 and EIP-1822 proxy slots.

| Token | Code size | `name()` | `symbol()` | `decimals()` | `balanceOf()` | Proxy? |
|---|---|---|---|---|---|---|
| USDC | 1,798 B | `USDC` | `USDC` | 6 | ✅ normal | **No** — direct implementation |
| USDT0 | 2,227 B | `USDT0` | `USDT0` | 6 | ✅ normal | ⚠️ **Yes** — EIP-1967 |
| AUSD | 5,937 B | `AUSD` | `AUSD` | 6 | ✅ normal | ⚠️ **Yes** — EIP-1967 |
| mUSD | 1,529 B | `MetaMask USD` | `mUSD` | 6 | ✅ normal | ⚠️ **Yes** — EIP-1967 |

- Every token returned code, answered all five calls without reverting, and
  matched its token-list metadata exactly.
- `balanceOf()` was exercised against both a live address and the zero address;
  all four behaved conventionally with no rebasing or fee-on-transfer weirdness
  visible from a read.
- **Three of four are upgradeable proxies.** 🔍 This is normal for bridged and
  issuer-controlled stablecoins and is not disqualifying, but it does mean their
  behaviour can change without an address change. See §20.
- All are **safe enough for the prototype's curated display list**.

---

## 8. Wallet addresses used for public read testing

✅ **EXECUTED** — these were **discovered from the chain itself**, not taken from
any article, leaderboard, or prior report. Method: scan recent `Transfer` logs
from the USDC contract, take recipients, then confirm each still holds a non-zero
balance via a direct `balanceOf` call. No private keys were involved at any point.

| # | Address | How it qualified |
|---|---|---|
| 1 | `0xF15c2b7e88B257D1F2Fe35240DC9553Dc21e4946` | Live USDC recipient, non-zero balance confirmed |
| 2 | `0xcD6b980029E6E6e0733ac8eC3E02be9410D09799` | Live USDC recipient, non-zero balance confirmed |
| 3 | `0xd651346d7c789536ebf06dc72aE3C8502cd695CC` | Live USDC recipient, non-zero balance confirmed |
| 4 | `0xB09684f5486d1af80699BbC27f14dd5A905da873` | ERC-721 owner, `ownerOf()` confirmed |
| 5 | `0xb2A44ce122FAB07Fc514ea7830623201b152D99D` | ERC-721 owner, `ownerOf()` confirmed |

⚠️ These are arbitrary third-party mainnet addresses used purely for read-only
testing. They rotate every run as the chain moves.

---

## 9. MON and stablecoin aggregation results

✅ **EXECUTED** — all reads pinned to block **88,613,299**.

| Asset | Combined raw | Combined formatted |
|---|---|---|
| **MON** | `1629382684819370271507052` wei | **1,629,382.684819370271507052 MON** |
| **USDC** | `10025337220` | **10,025.337220 USDC** |
| **USDT0** | `228109172` | **228.109172 USDT0** |
| **AUSD** | `646810575` | **646.810575 AUSD** |

- **Individual vs Multicall3: `IDENTICAL ✓`** — zero mismatches across all 20
  value comparisons. Decimals handled correctly per token (all 6dp here, 18dp for MON).
- Latency: individual **1,248 ms**, Multicall3 **106 ms**.
- **Failure surfacing: ✅ PASS.** A deliberate `balanceOf` against a non-token
  address (`0x…dEaD`) produced an explicit error row and set the snapshot's
  `partial` flag. It was **not** silently counted as zero. This mirrors the
  `ERC20BalanceCallFailed` contract behaviour from `contract-spike-v1`.

---

## 10. NFT providers investigated

Six providers were investigated. **Two were executed end-to-end; four are blocked
on credentials.** Nothing below is claimed on the strength of a changelog.

### ✅ EXECUTED — Sequence public Monad indexer

| Question | Answer |
|---|---|
| Supports Monad Mainnet today? | ✅ Yes — `chainID: 143`, `percentIndexed: 100`, `healthOK: true` |
| API key required? | ✅ **No** — fully keyless |
| Current ownership, not transfer history? | ✅ Yes — returns live balances |
| ERC-721? | ✅ Yes, typed `contractType: "ERC721"` |
| Contract address / token ID? | ✅ Both |
| Collection metadata? | ✅ `contractInfo.name` / `.symbol` |
| Token image / metadata URI? | ⚠️ **Field present but empty** on every token tested |
| Paginates? | ✅ `page: { pageSize: 200, more: bool }` |
| **Wallet-wide enumeration?** | ❌ **NO — this is the blocker. See below.** |

### ✅ EXECUTED — direct on-chain RPC (no provider at all)

| Question | Answer |
|---|---|
| Current ownership? | ✅ Authoritative — it *is* the chain |
| ERC-721 / contract / token ID? | ✅ All, via `balanceOf` + `tokenOfOwnerByIndex` |
| Metadata URI? | ✅ Via `tokenURI()` where implemented |
| Wallet-wide enumeration? | ❌ No — requires a candidate collection list |
| Token IDs for non-enumerable collections? | ❌ No — only a balance count |

### 🔒 BLOCKED — credential required

| Provider | Endpoint tested | HTTP status | Finding |
|---|---|---|---|
| **thirdweb Insight** | `https://143.insight.thirdweb.com/v1/nfts?owner_address=…` | **400** (no key) / **401** (bad key) | Endpoint live and chain-143 routed. Needs `x-client-id`. Free tier exists. 📄 |
| **BlockVision** | `https://api.blockvision.org/v2/monad/account/nfts?address=…` | **403** | Monad route exists. Needs `x-api-key`. |
| **Rarible** | `https://api.rarible.org/v0.1/items/byOwner?owner=MONAD:…` | **403** | Body: `"Api Key is required. Get your free key at https://api.rarible.org/dashboard in less than a minute"`. `MONAD:` namespace accepted. |
| **Etherscan V2 / Monadscan** | `https://api.etherscan.io/v2/api?chainid=143&module=account&action=addresstokennftbalance` | **200** with `"Missing/Invalid API Key"` | ✅ Monad **officially listed** in Etherscan V2 chainlist (`status: 1`). ⚠️ But `addresstokennftbalance` is an **Etherscan PRO (paid)** action. |
| **Zerion** | `https://api.zerion.io/v1/wallets/…/nft-positions/` | **402 Payment Required** | No free tier for this endpoint. |
| **Mobula** | `https://api.mobula.io/api/1/wallet/nfts?…` | **429** | Rate-limited before auth could even be assessed. Not evaluable. |

### ❌ Deprecated endpoint found

`https://api.monadscan.com/api?module=account&action=…` returns HTTP 200 with
`"You are using a deprecated V1 endpoint, switch to Etherscan API V2"`. Any
older guide pointing at Monadscan V1 is stale — use the Etherscan V2 unified
endpoint with `chainid=143`.

---

## 11–12. Exact endpoints tested and HTTP status codes

See the table in §10 — every row lists the exact URL and the observed status code.
Reproduce commands for all blocked providers are emitted by `npm run spike` and
stored in `spike-output.json` under `nftProviders[].detail`.

---

## 13. Pagination findings

- **Sequence** ✅ EXECUTED: returns `page: { column: "id", pageSize: 200, more: false }`.
  All test wallets fit in one page, so multi-page traversal was **not exercised**
  — 🔍 pagination is *present and documented in the response shape* but unproven
  under load.
- **On-chain** ✅ EXECUTED: no pagination concept; `tokenOfOwnerByIndex` is
  indexed 0…balance-1. The spike caps traversal at 50 tokens per collection.
- **thirdweb / BlockVision / Rarible / Etherscan** 🔒 BLOCKED — pagination params
  documented (`limit`/`page`/`size`/`offset`) but untested.

---

## 14. Rate-limit and pricing findings

| Service | Rate limit | Pricing |
|---|---|---|
| `rpc.monad.xyz` | 25 rps 📄 | Free |
| `rpc1.monad.xyz` | 15 rps 📄 | Free |
| `rpc2.monad.xyz` | 300 / 10s 📄 | Free — **observed 429 in practice** ✅ |
| `rpc3.monad.xyz` | 300 / 10s 📄 | Free |
| `rpc-mainnet.monadinfra.com` | 20 rps 📄 | Free |
| Sequence indexer | Not published; `quotaControlEnabled: true` in RuntimeStatus 🔍 | Free, keyless |
| thirdweb Insight | Not verified 🔒 | Free tier exists 📄 |
| Rarible | Not verified 🔒 | Free key, self-serve 📄 |
| Etherscan V2 | 5 rps free tier 📄 | **NFT holdings endpoint is PRO-only (paid)** ⚠️ |
| Zerion | — | Paid — HTTP 402 ✅ |

**No paid plan was purchased.**

---

## 15. Real NFT result

✅ **EXECUTED** — a genuine Monad Mainnet ERC-721 holding, verified by **two
independent sources**. No placeholders.

| Field | Value |
|---|---|
| **Wallet** | `0xB09684f5486d1af80699BbC27f14dd5A905da873` |
| **Collection** | `0x6657d192273731C3cAc646cc82D5F28D0CBE8CCC` |
| **Collection name** | `Clober Orderbook Maker Order` (`CLOB-ORDER`) |
| **ERC-165 `supportsInterface(0x80ac58cd)`** | ✅ true — genuine ERC-721 |
| **Balance** | 3 tokens |
| **Token IDs** | `12545482394577892289904084827318259398469053879361299149152533852512441073726`, `71494545495965413148817182263185483232393499679920044825443296515590201540884`, `109848252218586634191793332213769952430966428680127168105362046287593716318513` |
| **Source 1 — direct RPC `ownerOf()`** | ✅ CONFIRMED |
| **Source 2 — Sequence indexer** | ✅ HTTP 200, 8,543 ms, 3 ERC-721 entries |
| **Cross-verification** | ✅ **3/3 tokens Sequence reported were re-confirmed by on-chain `ownerOf()`** |
| **Metadata / image** | ⚠️ Sequence returned **empty** `image` and `name`. `tokenURI()` on-chain resolves to `https://clober.io/api/nft/chains/143/orders/…` |
| **Pagination** | Single page, `more: false` |
| **Latency** | ~8.5 s per Sequence call; ~1.2 s for the full on-chain path across 5 wallets |

A second confirmed holding: `0x2b197ea9CcAeec32560Ea8891ad17F0bb5866DD1` owns
token `74963` of `Pancake V3 Positions NFT-V1`
(`0x46A15B0b27311cedF172AB29E4f4766fbE7F4364`), `ownerOf()` confirmed.

**Index-lag finding** ✅ EXECUTED: the specific token my log scan found was
*absent* from Sequence's response, while all three tokens Sequence *did* return
were valid. 🔍 Conclusion: Sequence produces **no false positives but lags on
high-churn collections**. Clober order NFTs mint and burn continuously, so this
is close to a worst case — but it means Sequence must not be treated as
real-time.

**Product-relevant observation** 🔍: across 1,200 blocks scanned, *every* ERC-721
collection seen was a **DeFi position NFT** — Clober orderbook orders, PancakeSwap
V3 positions, Uniswap V4 positions. Zero PFP/art collections appeared in recent
activity. An "automatic NFT gallery" on Monad today would largely render
liquidity positions, not collectibles.

---

## 16. Errors and blockers

| # | Issue | Status |
|---|---|---|
| 1 | **No keyless provider can enumerate a wallet's NFTs.** Sequence's `GetTokenBalancesSummary` / `GetTokenBalancesDetails` with `contractTypes: ["ERC721"]` return **0 entries**, and unfiltered `GetTokenBalances` returns **ERC-20 only** — for a wallet that provably owns 3 ERC-721s. Only `GetTokenBalancesByContract` with an explicit collection works. | ❌ Hard blocker for Option A |
| 2 | Four providers (thirdweb, BlockVision, Rarible, Etherscan) require API keys not available in this environment | 🔒 BLOCKED |
| 3 | Etherscan V2 supports Monad, but NFT holdings is a **PRO/paid** action | ⚠️ Cost blocker |
| 4 | `eth_getLogs` fails above **100 blocks** on the primary RPC — undocumented | ✅ Found & worked around |
| 5 | `rpc.monad.xyz` batch ceiling is **20**, not the documented 100 | ✅ Found |
| 6 | `rpc2.monad.xyz` returned HTTP 429 on first run | ⚠️ Intermittent |
| 7 | Sequence latency ~8 s/call — too slow for interactive UI | ⚠️ Performance |
| 8 | Sequence returns empty image/name metadata on all tested tokens | ⚠️ Quality |
| 9 | Non-enumerable ERC-721 collections yield a balance but no token IDs on-chain | 🔍 Design constraint |

---

## 17. Primary provider recommendation

**Direct RPC via `rpc.monad.xyz` + Multicall3.**

Rationale: it is the only source that is authoritative, keyless, fast (106 ms for
a 5-wallet × 3-token portfolio), free, and has no vendor rate-limit exposure. For
MON and stablecoins it fully satisfies ONE's needs today, and it is the same data
path the `ONEIdentity` contract uses on-chain — so the UI and the contract cannot
disagree.

## 18. Fallback provider recommendation

**`rpc3.monad.xyz` (Ankr)** for RPC failover — 62 ms median and a more forgiving
300-per-10s budget.

**Sequence public indexer** as a secondary *cross-check* for collection-scoped NFT
balances — keyless and, when it answers, accurate (3/3 verified). Not suitable as
a primary path given ~8 s latency and index lag.

---

## 19. Option A or Option B recommendation

# → **Option B — Reduced Mainnet portfolio**

Ship **MON + USDC + USDT0 + AUSD + user-entered NFT collection balance checks.**
Do **not** ship an automatic ERC-721 gallery.

**The evidence requires this, and the brief pre-committed to it:** *"Do not ship an
automatic gallery if no affordable and reliable NFT provider passes the test."*
No provider passed.

1. **Every keyless path failed wallet-wide enumeration.** Sequence — the only
   provider reachable without a credential — returns zero ERC-721 rows from all
   three of its enumeration methods for a wallet that demonstrably owns three
   NFTs. This was tested four different ways before concluding.
2. **Every enumerating provider is credential-gated and untested.** Shipping a
   gallery would mean betting the demo on an integration never executed once.
3. **The one officially-listed, free-tier-adjacent option (Etherscan V2) puts NFT
   holdings behind a paid PRO plan**, which I was instructed not to purchase.
4. **Collection-scoped checks work perfectly today** with zero dependencies —
   `balanceOf(wallet)` per collection via Multicall3, which is exactly what
   `ONEIdentity.combinedERC721Balance()` and `meetsERC721Threshold()` already
   implement. **Option B is a direct mirror of the contract you have already
   built and hardened.**
5. **A gallery would mostly show LP positions anyway** — every collection found in
   1,200 blocks of live activity was a DeFi position NFT.

Option B is not a downgrade here; it is the feature that matches both the chain's
current NFT reality and the contract's existing threshold semantics. Option A
remains reachable later — see §20.

---

## 20. Remaining risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Three of four stablecoins are upgradeable proxies** (USDT0, AUSD, mUSD). Behaviour can change without an address change. | Medium | Pin addresses in config; re-verify metadata on deploy. Display-only usage limits blast radius. |
| 2 | **Curated collection list is a manual, unbounded surface.** Option B needs users to enter collections, or ONE to ship a hand-picked list that goes stale. | Medium | Ship a small verified list + free-text address entry with on-chain ERC-165 validation. |
| 3 | **Non-enumerable ERC-721s give counts but no token IDs**, so a "which ones" view is impossible for some collections. | Low | Show counts; only render tokens where `tokenOfOwnerByIndex` exists. |
| 4 | **Undocumented RPC limits may change** (100-block logs, 20-batch). | Medium | Both are measured at runtime by `src/rpc.ts`; keep the probe in CI. |
| 5 | **Single primary RPC at 25 rps.** A demo with concurrent users could throttle. | Medium | Fallback wired; use Multicall3 to keep request counts ~1 per view. |
| 6 | **Sequence index lag** on high-churn collections. | Low (Option B) | Only used as cross-check; on-chain is authoritative. |
| 7 | **Test wallets rotate every run** — the report's addresses are point-in-time. | Informational | Values are pinned to block 88,613,299 for reproducibility. |
| 8 | **No provider was proven able to enumerate NFTs at all on Monad.** If Option A is ever wanted, this is unproven, not merely unbuilt. | High *(for Option A only)* | Obtain a thirdweb or Rarible free key and re-run — the adapters are already written and will execute immediately. |

---

## Reproducing

```bash
cd spikes/mainnet-data
npm install
npm run typecheck
npm run spike       # writes results/spike-output.json
```

No credentials are needed for the executed paths. Adding keys to `.env`
(see `.env.example`) automatically un-blocks the corresponding adapters —
no code changes required.
