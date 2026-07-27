# Verified ONE V2 — Status Briefing (LIVE in production)

_Snapshot: 2026-07-27. Verified ONE V2 is merged, deployed, and verified live on
`oneidentity.app`._

## What it is
ONE (oneidentity.app) on **Monad Mainnet (chain 143)**. **Verified ONE V2** lets a
user link multiple wallets into one public on-chain identity by having the
wallet-being-linked send a **small MON transfer** to the primary — the linked
wallet never connects, signs, or touches the contract. **V1 is read-only legacy**
(existing identities still load; no new V1 creation). Watch-only portfolio is
independent of both.

## Merge / deploy state — DONE
- `feature/verified-one-v2` was **fast-forwarded into `main`** (no merge commit).
- GitHub `main` and the feature branch are **identical at commit
  `1df1458d48125df707d6067cd9d1a4f0f416382c`**.
- **Vercel production deployment is READY and serving `oneidentity.app`** (region
  iad1; build ~55s). V1 sign-based create UI is gone; `/verified` is V2
  transfer-only.

## Live end-to-end verification — PASSED
- A **real transfer-link on `oneidentity.app` succeeded** end to end (connect
  primary → send exact MON from the wallet being linked → auto-detected →
  approved → identity created).
- **Production contract `0x75C9391258F127992Ff91EB8cA0339c32A5E63C6` now reports
  `totalOnes = 1`** — the live link landed on the production contract.
- The **staging contract `0x2df1b222d48859c3E3CD217B78Ac29966901485E` remains
  separate at `totalOnes = 5`** (no crossover between environments).
- **V1 legacy profiles remain available** at `/one/[address]` (read-only).
- Early "already belongs to a ONE" rejections during testing were expected — they
  were wallets already linked in V1 or in prior attempts, not a defect.

## Production infrastructure (fresh — NOT reusing staging)
- **Contract:** `ONERegistryV2` at
  **`0x75C9391258F127992Ff91EB8cA0339c32A5E63C6`** (Monad Mainnet).
  Constructor: v1Registry `0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`,
  verifier `0x20B916fA862073ED0E0f12FeBa6a6eFef7b03A4C` (fresh key),
  verifierAdmin `0xD28035d9BfF601ec713b8D36a04e2d2Dbd2b2177` (hardware wallet,
  immutable). Read-only verification passed: VERSION 2, MAX_MEMBERS 20,
  MIN_MEMBERS 2, EIP-712 domain "ONE Link"/"1"/chain 143.
- **Database:** fresh Neon production project; migrations 001 + 002 applied and
  verified.
- **Env vars (Vercel, Production scope):** three required and set —
  `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS` (= the production contract), `DATABASE_URL`
  (secret), `VERIFIER_PRIVATE_KEY` (secret). Already present:
  `NEXT_PUBLIC_ONE_REGISTRY_ADDRESS` (V1), `NEXT_PUBLIC_REOWN_PROJECT_ID`.
  **Not needed:** `MONAD_MAINNET_RPC_URL` (RPC hardcoded in `chain.ts`),
  `CRON_SECRET` / `INDEXER_CONFIRMATIONS` (optional — link detection runs inline on
  the status poll via `runIndexerTick`; no cron is scheduled).
  _(No secret values, private keys, DB URLs, or transaction secrets are recorded
  in this doc — only public on-chain addresses.)_

## Regression (at merge)
lint ✓ · typecheck ✓ · **678 tests ✓** · production build ✓ (all V2 routes present).

## Rollback
Vercel → Deployments → **Instant Rollback** to the previous production build. The
contract and DB are independent and harmless if unused, so rollback needs no
on-chain action.

## Post-launch follow-ups (optional)
- Repoint the homepage "EXAMPLE" card to a production V2 identity once desired
  (synthetic/demo is acceptable meanwhile).
- Add a cron schedule + `CRON_SECRET` only if fully-background detection is wanted
  (needs Vercel Pro).

## Separately parked (NOT part of this launch)
`feature/dynamic-asset-discovery-v1` adds Envio-based dynamic asset discovery —
the fungible portfolio UI (Recognized / Other / Likely-spam) is built and green;
NFT unification deferred; the live Envio path has **never been tested** (needs a
free `ENVIO_API_TOKEN`). Committed, **not merged**.
