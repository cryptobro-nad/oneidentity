# ONE — Monad Mainnet data spike

A read-only investigation into whether ONE can reliably retrieve real Monad
Mainnet (chain ID **143**) balances and NFT holdings.

**This spike never signs, deploys, or touches a private key.** Every call is a
read. It is deliberately separate from `contracts/` and shares no code with it.

> **Findings and recommendation: [`results/REPORT.md`](./results/REPORT.md)**
>
> **Bottom line: ship Option B** — MON + USDC/USDT0/AUSD + user-entered NFT
> collection balance checks. No provider tested could enumerate a wallet's NFTs
> on Monad without a credential, so an automatic gallery is not yet supportable.

## Running

```bash
npm install
npm run typecheck
npm run spike        # ~60s, writes results/spike-output.json
```

No API keys are required. Everything the spike reports as EXECUTED runs against
live Monad Mainnet with zero credentials.

## Layout

| File | Purpose |
|---|---|
| `src/rpc.ts` | Chain config + live endpoint probing (latency, batching, batch-size ceiling) |
| `src/stablecoins.ts` | Curated stablecoin config + on-chain metadata/proxy verification |
| `src/discovery.ts` | Finds real holders and NFT owners **from live chain logs** |
| `src/nft-provider.ts` | `NftDataProvider` abstraction + adapters |
| `src/aggregate.ts` | Multi-wallet balance and NFT aggregation with explicit failure surfacing |
| `src/run.ts` | Orchestrator; writes `results/spike-output.json` |

## Design rules this spike follows

- **No fabricated data.** Test wallets are discovered by scanning live `Transfer`
  logs and confirming holdings with a direct `balanceOf` / `ownerOf` call. If the
  chain yields nothing, the spike reports nothing — it never invents a balance.
- **No fake provider adapters.** Key-gated providers are implemented as real
  request builders. Without a credential they throw `ProviderBlockedError`
  carrying the exact `curl` needed to reproduce the test. None returns sample data.
- **A failed read is never a zero.** Every result is an explicit
  `{ ok: true, value }` or `{ ok: false, error }`, and any total derived from an
  incomplete set is flagged `partial` — mirroring `ONEIdentity.sol`'s
  `ERC20BalanceCallFailed` behaviour.
- **Documentation is verified, not trusted.** Documented RPC batch limits were
  measured; two of five turned out to be wrong (see the report).

## Adding credentials

Copy `.env.example` to `.env` and fill in any provider key. The corresponding
adapter un-blocks automatically on the next run — no code changes. `.env` is
gitignored.
