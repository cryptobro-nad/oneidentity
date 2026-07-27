# Verified ONE V2 — Production Launch Runbook (fresh contract)

How to take `feature/verified-one-v2` to production (`oneidentity.app`) safely,
deploying a **fresh** production `ONERegistryV2` (we are NOT reusing the staging
contract). Do all pre-merge infrastructure **before** merging: `/verified` is
V2-only, so a merge without V2 configured leaves that page inert (it degrades
gracefully — see below — but the intent is a real launch).

Chosen path: **fresh production contract + fresh, securely-stored verifier key +
a verifierAdmin multisig.** Production starts with zero identities and is never
secured by staging keys.

## Merge readiness
- Branch is **20 ahead / 0 behind `origin/main`** → clean fast-forward, zero
  conflicts.
- Full regression green on the branch: contract tests, app tests, lint,
  typecheck, build (678 app tests as of this doc).

## What the merge changes on production
- **Identity creation becomes V2-only** — `/verified` is the transfer-linking
  flow; the V1 sign-based create UI is gone.
- **V1 stays read-only legacy** — existing V1 identities still load at
  `/one/[address]` and can be managed (remove members). No new V1 creation.
- New: `/one-v2/[address]` public profiles, `/api/v2/link/*` routes, the header
  wallet connect control, and the public lookup now finds V2 identities.
- Homepage copy reflects the transfer method.

## Graceful degradation (safety net)
If the V2 env vars are **not** set, nothing crashes: `/verified` shows "Linking
is not enabled on this deployment yet." and the challenge API returns `503`. So a
premature merge is recoverable.

---

## Production environment variables — the real list (verified against code)

Only **three** new values are required for V2 to function in production:

| Variable | Scope | Secret | Required? | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | Production | yes | **required** | Fresh production Neon DB. Never the staging DB. |
| `VERIFIER_PRIVATE_KEY` | Production | yes | **required** | Signs attestations. Its address MUST equal the contract's `verifier()`. Server-only, never `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS` | Production | no | **required** | The fresh production contract address. |

Already present in production (no action beyond confirming Production scope):
- `NEXT_PUBLIC_ONE_REGISTRY_ADDRESS` — the V1 registry (`0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`).
- `NEXT_PUBLIC_REOWN_PROJECT_ID` — `126fe81e68fbe13c8eec388a03df113a` (WalletConnect); confirm `oneidentity.app` is in that Reown project's allowed domains.

**NOT required (corrections to earlier drafts, confirmed against code):**
- `MONAD_MAINNET_RPC_URL` — **not read anywhere.** RPC endpoints are hardcoded in
  `src/lib/chain.ts` (`https://rpc.monad.xyz` + fallbacks). Do not set it.
- `CRON_SECRET` — **optional.** Detection runs inline on the status poll
  (`runIndexerTick` inside `GET /api/v2/link/challenge/[id]`); there is no
  `vercel.json`, so cron is not scheduled. Only set this if you later add a cron
  schedule (needs Vercel Pro for 1/min).
- `INDEXER_CONFIRMATIONS` — **optional**, defaults to `8`.

---

## Launch checklist — separated by who does what

Steps are ordered. Nothing here merges or deploys to production; the merge is the
final, separate, explicitly-authorised step.

### A. Actions Claude can perform (no secrets, no wallet)
- A1. Keep this runbook and the exact commands current (done).
- A2. After the contract is deployed and you give me its address, run the
  **read-only** on-chain verification (`VerifyONERegistryV2`) against Monad
  Mainnet and report pass/fail. No secrets involved.
- A3. Provide the exact migration command for you to run in your terminal.
- A4. Do a final pre-merge gate run (lint/typecheck/test/build) and re-confirm the
  branch is still a clean fast-forward.
- A5. Perform the git merge to `main` — **only on your explicit "go"**, after A2–A4
  and section E all pass.

### B. Dashboard steps you must perform
- B1. **Create a fresh production Neon database.** Copy its connection string into
  your password manager. Never paste it into chat.
- B2. **Generate a fresh production verifier keypair** (a brand-new EOA — e.g. a
  new MetaMask account used only for this, or a key manager). Save the **private
  key** in your password manager. Note the **public address** (this is the
  `verifier`).
- B3. **Create the verifierAdmin** — recommended: a **Safe multisig** on Monad.
  Note its address (this is `verifierAdmin`, the only role that can ever rotate
  the verifier). A dedicated hardware-wallet EOA is the minimum acceptable
  fallback.
- B4. **Set the three Production env vars** in Vercel (project `oneidentity`,
  Production scope): `DATABASE_URL`, `VERIFIER_PRIVATE_KEY`,
  `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS`. Confirm the two already-present
  `NEXT_PUBLIC_*` vars are also set for Production.
- B5. **Run the migration** in your terminal (command from A3), because
  `DATABASE_URL` must stay out of chat.

### C. Wallet transactions you must approve
- C1. **Deploy `ONERegistryV2`** on **Monad Mainnet (chain 143)** via Remix +
  MetaMask (same as staging), with constructor args:
  - `v1Registry` = `0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`
    (must equal production `NEXT_PUBLIC_ONE_REGISTRY_ADDRESS`)
  - `verifier` = your production verifier public address (from B2)
  - `verifierAdmin` = your verifierAdmin/Safe address (from B3)
  One deploy transaction. Record the deployed address.
- C2. (If using a Safe) the Safe creation transaction(s) in B3.
- C3. **Post-merge only** — the end-to-end check: one small MON transfer from a
  second wallet, then the primary's on-chain link/approve transaction.

> The contract deploy is done from your wallet so no private key is ever handled
> in chat or by the repo tooling. (The Foundry deploy script exists but expects a
> `DEPLOYER_PRIVATE_KEY`; prefer Remix + MetaMask to avoid handling a raw key.)

### D. Values to save securely (record these before merge)
| Value | Sensitivity | Where |
|---|---|---|
| Production verifier **private key** | SECRET | password manager / KMS only |
| `VERIFIER_PRIVATE_KEY` in Vercel | SECRET | Vercel Production env (not chat) |
| Production `DATABASE_URL` | SECRET | password manager + Vercel Production env |
| Production contract address | public | this runbook / your records |
| verifier **public** address | public | your records (must match `verifier()`) |
| verifierAdmin / Safe address | public | your records |
| Deployer address used for C1 | public | your records |

### E. Verification checks before we merge (all must pass)
- E1. **Read-only contract verification** (Claude runs, A2):
  ```sh
  export NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS=0x…prod…
  export V1_REGISTRY_ADDRESS=0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915
  export STAGING_VERIFIER_ADDRESS=0x…prodVerifierPublic…       # cross-check
  export STAGING_VERIFIER_ADMIN_ADDRESS=0x…prodAdmin…          # cross-check
  forge script contracts/script/VerifyONERegistryV2.s.sol --rpc-url https://rpc.monad.xyz
  ```
  (The `STAGING_*` names are the script's historical parameter names; the VALUES
  here are production values.) Confirms: `v1`/`verifier`/`verifierAdmin` match,
  `MAX_MEMBERS=20`, `MIN_MEMBERS=2`, `VERSION=2`, EIP-712 domain
  (`"ONE Link"`/`"1"`/chainId 143/verifyingContract = the contract), and
  **`totalOnes == 0`** (proves a clean, identity-free production contract).
- E2. **Production DB migrated** — the two migrations applied:
  `v2link_001_init` and `v2link_002_uniqueness_and_ratelimit`.
- E3. **Env sanity** — the three Production vars set; the verifier private key's
  address equals `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS`'s `verifier()`; no secret
  carries a `NEXT_PUBLIC_` prefix.
- E4. **Branch** still `0 behind main`; final gates green.

The migration command for B5 / E2:
```sh
export DATABASE_URL='…production Neon…'   # your terminal only, never in chat
export CONFIRM_STAGING_DATABASE=yes       # the runner's confirm gate (name is historical)
node app/scripts/migrate-staging.mjs
```

---

## The merge (final step — only after A–E pass and you say go)
1. Merge `feature/verified-one-v2` → `main` (clean fast-forward). Claude does this on your go.
2. Vercel auto-deploys `main` to production.
3. Do **not** add a cron schedule unless you have deliberately chosen to.

## Post-merge verification (on `oneidentity.app`)
- `/verified` loads V2 transfer-only; the header **Connect** works.
- Public lookup finds both V1 and V2 identities.
- Existing **V1** identities still load at `/one/[address]`.
- **Real end-to-end link** (C3): connect primary → enter a wallet → send the exact
  MON → auto-detect → approve → identity created; `/one-v2/<address>` then loads
  with live balances.
- No secret in the client bundle (only `NEXT_PUBLIC_*` should appear).

## Rollback
- **Fastest:** Vercel → Deployments → **Instant Rollback** to the previous
  production deployment.
- **Or** revert the merge commit on `main` and let it redeploy.
- The contract and DB are independent and harmless if unused, so rollback needs
  no on-chain action.

## Hard separation rules
- Production uses its **own** fresh Neon DB, **own** fresh contract, and **own**
  fresh verifier key. Staging keys/data never secure or mix with production.
- `VERIFIER_PRIVATE_KEY` and `DATABASE_URL` are secrets: Production scope only,
  never `NEXT_PUBLIC_`, never logged (errors are redacted by `safeErrorMessage`).

---

## Appendix — C1 exact Remix deployment (copy-paste ready)

Staging was deployed via Remix + MetaMask using the flattened source; production
uses the same path so no private key is ever handled outside your wallet.

**Source file to paste into Remix:** `contracts/remix/ONERegistryV2.flat.sol`
(self-contained single file — SPDX `MIT`, `pragma solidity =0.8.28 ^0.8.20`, no
external imports or libraries to link).

**Compiler settings (must match exactly — set these in the Solidity Compiler tab):**
- Compiler version: **0.8.28**
- Optimizer: **Enabled**, **200** runs
- EVM version: **shanghai**  ← important; do not leave it on the Remix default
  (cancun/prague), Monad targets shanghai.
- Contract to deploy (dropdown): **`ONERegistryV2`** (not the interface, not the
  minimal `ONEIdentityV2` helper the file also contains).

**Constructor arguments — exact order** (`constructor(address v1Registry, address verifier_, address verifierAdmin_)`):
1. `v1Registry`  = `0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`  (fixed — the immutable V1 registry; must equal production `NEXT_PUBLIC_ONE_REGISTRY_ADDRESS`)
2. `verifier_`   = `<PRODUCTION_VERIFIER_ADDRESS>`  (public address of the fresh key from B2)
3. `verifierAdmin_` = `<PRODUCTION_VERIFIER_ADMIN_ADDRESS>`  (Safe/admin from B3)

If Remix shows one inline field instead of three, enter them comma-separated in
that order:
`0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915,<PRODUCTION_VERIFIER_ADDRESS>,<PRODUCTION_VERIFIER_ADMIN_ADDRESS>`

**Deploy environment / value:**
- Environment: **Injected Provider – MetaMask**, network **Monad Mainnet (chain 143)**.
- **Value: 0.** The constructor is **not payable** — sending any value reverts.
  Leave the Value field at 0; you only pay gas (MON) from the deployer wallet.
- The constructor rejects a zero address for any of the three args, so a fat-
  fingered blank arg fails fast rather than deploying a broken registry.

**Immediately after deploy:**
- Record the **deployed contract address** and the deploy **tx hash**.
- Read-only verification (Claude runs; see E1) —
  `forge script contracts/script/VerifyONERegistryV2.s.sol --rpc-url https://rpc.monad.xyz`
  with `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS` set to the new address (and the
  verifier/admin as `STAGING_*` cross-check envs). It confirms
  `v1`/`verifier`/`verifierAdmin`, `MAX_MEMBERS=20`, `MIN_MEMBERS=2`, `VERSION=2`,
  the EIP-712 domain (`"ONE Link"`/`"1"`/143/verifyingContract = the new address),
  and **`totalOnes == 0`**.
- Optional manual spot-checks (anyone can run, read-only):
  ```sh
  cast call <ADDR> "verifier()(address)"       --rpc-url https://rpc.monad.xyz
  cast call <ADDR> "verifierAdmin()(address)"   --rpc-url https://rpc.monad.xyz
  cast call <ADDR> "v1()(address)"              --rpc-url https://rpc.monad.xyz
  cast call <ADDR> "VERSION()(uint16)"          --rpc-url https://rpc.monad.xyz
  cast call <ADDR> "totalOnes()(uint256)"       --rpc-url https://rpc.monad.xyz
  ```
- Do **not** compare runtime bytecode against staging: `verifierAdmin` and `v1`
  are immutables baked into the deployed code, so production's bytecode
  legitimately differs. The functional verify above is the authoritative check.

## Follow-ups (post-launch, optional)
- Repoint the homepage "EXAMPLE" card to a real production V2 identity once one
  exists (synthetic/demo is acceptable meanwhile).
- Add a cron schedule + `CRON_SECRET` only if you want fully-background detection
  and you are on Vercel Pro.
