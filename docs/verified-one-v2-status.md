# Verified ONE V2 — Status Briefing (production launch in progress)

_Snapshot: 2026-07-27. Production launch underway on the fresh-contract path.
Branch NOT merged to `main` yet._

## What it is
ONE (oneidentity.app) on **Monad Mainnet (chain 143)**. **Verified ONE V2** lets a
user link multiple wallets into one public on-chain identity by having the
wallet-being-linked send a **small MON transfer** to the primary — the linked
wallet never connects, signs, or touches the contract. **V1 is now read-only
legacy** (existing identities still load; no new V1 creation). Watch-only
portfolio is independent of both.

## Branch / merge readiness
`feature/verified-one-v2` — **22 commits ahead / 0 behind `main`, clean
fast-forward, zero conflicts. NOT merged yet.**

## What the merge changes on production
- `/verified` becomes V2 **transfer-only** (old V1 sign-to-create UI removed).
- V1 identities still load read-only at `/one/[address]`.
- New: `/one-v2/[address]` public profiles, `/api/v2/link/*` API, a header
  wallet-connect control, homepage copy for the transfer method.
- Graceful degradation: if V2 env is unset, `/verified` shows "Linking is not
  enabled" and the API returns HTTP 503 — never crashes.

## Production infrastructure (fresh — NOT reusing staging)
- **Contract:** `ONERegistryV2` deployed fresh on Monad Mainnet at
  **`0x75C9391258F127992Ff91EB8cA0339c32A5E63C6`**.
  Constructor: v1Registry `0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`,
  verifier `0x20B916fA862073ED0E0f12FeBa6a6eFef7b03A4C` (fresh key),
  verifierAdmin `0xD28035d9BfF601ec713b8D36a04e2d2Dbd2b2177` (Tangem hardware
  wallet, immutable). Read-only verification passed: VERSION 2, MAX_MEMBERS 20,
  MIN_MEMBERS 2, EIP-712 domain "ONE Link"/"1"/chain 143, **totalOnes 0**.
- **Database:** fresh Neon production project; migrations 001 + 002 applied and
  verified (tables, unique indexes, scan lease, rate-limit — all OK).
- **Env vars (Vercel, Production scope):** only **3 required**, set by the user —
  `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS=0x75C9…63C6`, `DATABASE_URL` (secret),
  `VERIFIER_PRIVATE_KEY` (secret). Already present: `NEXT_PUBLIC_ONE_REGISTRY_ADDRESS`
  (V1), `NEXT_PUBLIC_REOWN_PROJECT_ID`. **Not needed:** `MONAD_MAINNET_RPC_URL`
  (RPC hardcoded in `chain.ts`), `CRON_SECRET`/`INDEXER_CONFIRMATIONS` (optional —
  link detection runs inline on the status poll via `runIndexerTick`; no cron is
  scheduled).

## Regression
lint ✓ · typecheck ✓ · **678 tests ✓** · production build ✓ (all V2 routes present).

## Status board
| Item | Status |
|---|---|
| Production contract deployed + verified (`0x75C9…63C6`) | ✅ |
| Production DB migrated | ✅ |
| 3 Production env vars set | ✅ (assistant can't read them — Vercel access is read-only) |
| Branch clean fast-forward + full regression green | ✅ |

## Immediate next step
User is confirming two things only they can check:
1. Production `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS` = `0x75C9…63C6` (not the
   staging `0x2df1…`).
2. The saved `VERIFIER_PRIVATE_KEY` derives to `0x20B916fA…03A4C` (otherwise the
   contract rejects every link).

On the user's explicit "go": merge `feature/verified-one-v2` → `main`
(fast-forward), Vercel auto-deploys production, then a live end-to-end link test
on oneidentity.app + confirming V1 legacy profiles still load.
**Rollback:** Vercel → Deployments → Instant Rollback.

Full launch checklist: `docs/verified-one-v2-production-merge-runbook.md`.

## Separately parked (NOT part of this launch)
`feature/dynamic-asset-discovery-v1` adds Envio-based dynamic asset discovery —
the fungible portfolio UI (Recognized / Other / Likely-spam) is built and green;
NFT unification deferred; the live Envio path has **never been tested** (needs a
free `ENVIO_API_TOKEN`). Committed, not merged.
