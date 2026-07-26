# Verified ONE V2 — Production Merge / Launch Runbook

How to take `feature/verified-one-v2` to production (`oneidentity.app`) safely.
Do the pre-merge infrastructure **before** merging, because `/verified` is
V2-only now — a merge without V2 configured leaves that page non-functional
(though it degrades gracefully; see below).

## Merge readiness (as of this doc)
- `main` has **not advanced** since the branch forked; **zero files conflict**.
  Merging is a clean fast-forward — no conflict resolution needed.
- Gates green on the branch: contract tests, app tests, lint, typecheck, build.

## What the merge changes on production
- **Identity creation becomes V2-only** — `/verified` is the transfer-linking
  flow; the V1 sign-based create UI is gone.
- **V1 stays read-only legacy** — existing V1 identities still load at
  `/one/[address]` and can be managed (remove members). No V1 creation.
- New: `/one-v2/[address]` public profiles, `/api/v2/link/*` routes, the header
  wallet connect control, and the public lookup now finds V2 identities.
- Homepage copy reflects the transfer method.

## Graceful degradation (safety net)
If the V2 env vars are **not** set in production, nothing crashes: `/verified`
shows "Linking is not enabled on this deployment yet." and the challenge API
returns `503`. So a premature merge is recoverable — but the intent is to
configure production first so the merge is a real launch.

---

## Pre-merge: production infrastructure

### Decision — reuse staging or provision fresh?
Three resources back V2. Recommendations:

| Resource | Recommendation |
|---|---|
| **Neon database** | **Fresh production DB.** Never share the staging DB — production challenge data must not mix with staging test data. |
| **V2 contract** | **Prefer a fresh production `ONERegistryV2`** so production isn't secured by casually-generated staging keys and doesn't carry staging test identities. Reuse of the staging contract (`0x2df1…485E`) is *possible* but not advised. |
| **Verifier key** | **Fresh, securely-stored key** (KMS/HSM ideal; at minimum a dedicated key used only for production, server-side only). Its public address must equal the production contract's `verifier()`. |
| **verifierAdmin** | A production **multisig** (e.g. a Safe) — the only role that can rotate the verifier. |

### 1. Deploy the production contract (if fresh)
Use the repo tooling (`docs/verified-one-v2-staging-runbook.md` steps 3–7) or
Remix, with production constructor values:
- `v1Registry` = `0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`
- `verifier` = production verifier public address
- `verifierAdmin` = production multisig address

Validate read-only afterward:
```sh
export NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS=0x…prod…
export V1_REGISTRY_ADDRESS=0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915
export STAGING_VERIFIER_ADDRESS=0x…prodVerifier…
export STAGING_VERIFIER_ADMIN_ADDRESS=0x…prodAdmin…
forge script contracts/script/VerifyONERegistryV2.s.sol --rpc-url https://rpc.monad.xyz
```

### 2. Provision the production Neon DB and migrate
```sh
export DATABASE_URL='…production Neon…'
export CONFIRM_STAGING_DATABASE=yes   # the runner's confirmation gate; this IS the prod DB
node app/scripts/migrate-staging.mjs
```
(or `psql "$DATABASE_URL" -f app/migrations/v2link_001_init.sql` then `…_002_…sql`)

### 3. Set PRODUCTION-scope env vars in Vercel (oneidentity project)
Set these for the **Production** environment (server-only secrets never `NEXT_PUBLIC_`):
- `DATABASE_URL` — production Neon (secret)
- `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS` — production contract (public)
- `VERIFIER_PRIVATE_KEY` — production verifier key (secret, server-only)
- `CRON_SECRET` — a fresh random token (secret)
- `MONAD_MAINNET_RPC_URL` — `https://rpc.monad.xyz`
- `INDEXER_CONFIRMATIONS` — `8`
- `NEXT_PUBLIC_REOWN_PROJECT_ID` — already `126fe81e68fbe13c8eec388a03df113a`; confirm it's set for **Production** and that `oneidentity.app` is in the Reown project's allowed domains.

**Set these before the merge deploy**, or the first production build won't have them (`NEXT_PUBLIC_` values are inlined at build time).

---

## The merge
1. Open a PR from `feature/verified-one-v2` → `main` (or merge directly). Clean fast-forward.
2. Vercel auto-deploys `main` to production.
3. **Do not enable the cron** unless you've decided to (needs Vercel Pro for 1/min; polling detection is sufficient — see the cron discussion).

## Post-merge verification (on `oneidentity.app`)
- `/verified` loads V2 transfer-only; the header **Connect** works.
- Public lookup finds both V1 and V2 identities.
- Existing **V1** identities still load at `/one/[address]`.
- **Real end-to-end link** with two funded wallets you control: connect primary →
  enter a wallet → send the exact MON → auto-detect → approve → identity created;
  then `/one-v2/<address>` loads with live balances.
- No secret in the client bundle (only `NEXT_PUBLIC_*` should appear).

## Rollback
- **Fastest:** in Vercel → Deployments, **Instant Rollback** to the previous
  production deployment. Reverts the site immediately.
- **Or** revert the merge commit on `main` and let it redeploy.
- The V2 contract and DB are independent and harmless if unused, so a rollback
  needs no on-chain action.

## Hard separation rules
- Production uses its **own** Neon DB and (recommended) its **own** contract +
  verifier key. Staging keys/data must never secure or mix with production.
- `VERIFIER_PRIVATE_KEY` and `DATABASE_URL` are secrets: Production scope, never
  `NEXT_PUBLIC_`, never logged (errors are redacted by `safeErrorMessage`).

## Follow-ups (post-launch, optional)
- Repoint the homepage "EXAMPLE" card to a real production V2 identity once one exists.
- Reconsider the cron if you want background detection and you're on Vercel Pro.
