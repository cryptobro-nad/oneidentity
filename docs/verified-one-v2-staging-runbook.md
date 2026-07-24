# Verified ONE V2 — Staging Runbook

A strict, sequential checklist for a **controlled staging** deploy of Verified ONE
V2. Do **not** merge to main, attach `oneidentity.app`, reuse staging secrets in
production, or enable the cron before step 13.

Each step has a **STOP** condition. If it is not met, halt and report — do not
continue.

Legend: 🔒 handled by the operator (keys/credentials); 🤖 tooling in this repo.

Prerequisites: `forge`, `psql`, the Vercel CLI (or dashboard), a funded Monad
deployer wallet, and two funded test wallets you control. Fill a private copy of
`.env.staging.example` (never commit it).

---

## 1. Provision the Neon staging database 🔒
- Create a **new** Neon project/branch for staging. Copy its `DATABASE_URL`.
- **STOP** unless this is a brand-new staging database with no production data.

## 2. Apply + verify the schema 🤖
```sh
export DATABASE_URL="…staging…"
export CONFIRM_STAGING_DATABASE=yes
scripts/setup-v2-staging-db.sh
```
- Applies 001 then 002, re-applies both (idempotency), verifies all four tables,
  the four partial unique indexes, the removed `v2_uniq_active_amount`, the scan
  lease, and the rate-limit table.
- **STOP** unless the script prints `RESULT: staging V2 schema present and functional.` and exits 0.

## 3. Generate the staging verifier securely 🔒
- On your secure machine: `cast wallet new`. Record only the **public address**
  → `STAGING_VERIFIER_ADDRESS`. Put the private key straight into the Vercel
  Preview env as `VERIFIER_PRIVATE_KEY` (step 8); never write it to disk or paste it back.
- **STOP** if the key is a personal wallet, the production verifier, or has ever been printed/logged.

## 4. Configure verifierAdmin 🔒
- Choose a **separate** staging `verifierAdmin` (a staging Safe or a distinct
  address) → `STAGING_VERIFIER_ADMIN_ADDRESS`.
- **STOP** if it equals the verifier, a personal key, or a production address.

## 5. Simulate the contract deployment 🤖 (sends nothing)
```sh
cd contracts
export DEPLOYER_PRIVATE_KEY=…   V1_REGISTRY_ADDRESS=0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915
export STAGING_VERIFIER_ADDRESS=…   STAGING_VERIFIER_ADMIN_ADDRESS=…
forge script script/DeployONERegistryV2.s.sol --rpc-url "$MONAD_MAINNET_RPC_URL"
```
- The script guards chain 143, rejects any `address(0)` constructor arg, and runs
  all post-deploy assertions in simulation. The deployer private key is never printed.
- **STOP** unless the simulation prints “All post-deployment checks passed.” and the
  logged constructor v1/verifier/verifierAdmin match your intended values.

## 6. Deploy the contract 🤖🔒 (irreversible, real gas)
```sh
forge script script/DeployONERegistryV2.s.sol --rpc-url "$MONAD_MAINNET_RPC_URL" --broadcast
```
- Record the deployed address and the tx hash from
  `broadcast/DeployONERegistryV2.s.sol/143/run-latest.json`.
- **STOP** unless the broadcast succeeded and the address has bytecode. Do **not** touch V1.

## 7. Validate the deployed state 🤖 (read-only)
```sh
export NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS=0x…deployed…
forge script script/VerifyONERegistryV2.s.sol --rpc-url "$MONAD_MAINNET_RPC_URL"
```
- Checks `v1()`, `verifier()`, `verifierAdmin()` (cross-checked against your env),
  `MAX_MEMBERS()=20`, `MIN_MEMBERS()=2`, `VERSION()=2`, clean initial state, and the
  EIP-712 domain (chain 143, verifyingContract = the deployed address).
- Optionally compare bytecode: `diff <(cast code $REG) <(forge inspect src/ONERegistryV2.sol:ONERegistryV2 deployedBytecode)`.
- **STOP** unless every read matches the reviewed design and the verifier equals the step-3 signer.

## 8. Configure Vercel Preview variables 🔒
- Set (Preview scope): `DATABASE_URL`, `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS`,
  `VERIFIER_PRIVATE_KEY`, `CRON_SECRET`, `MONAD_MAINNET_RPC_URL`, `INDEXER_CONFIRMATIONS=8`.
- **STOP** if `VERIFIER_PRIVATE_KEY` is set with a `NEXT_PUBLIC_` prefix, or if
  `DEPLOYER_PRIVATE_KEY` was added to Vercel (it must never be).

## 9. Deploy the feature branch preview 🔒
- Deploy `feature/verified-one-v2` to a **staging** Vercel URL. Do **not** attach `oneidentity.app`.
- Smoke test: `/verified` loads; V1 “Each wallet signs” mode still works; V2 “Link by
  transfer” mode loads; `/one-v2/<the deployed registry or a member>` loads; a challenge
  POST reaches Neon (row in `v2_challenges`).
- Confirm no secret appears in the client bundle (already asserted pre-deploy: only
  `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS` is inlined) and that API errors are redacted.
- **STOP** if any secret is visible client-side, or an API error leaks a connection string/key.

## 10. Confirm the cron remains disabled 🔒
- Ensure no Vercel Cron is attached to `/api/v2/link/cron` yet.
- **STOP** if a cron is already firing — detection must first be proven via polling.

## 11. Manual real-wallet link test 🔒 (two wallets you control)
- Connect the **primary** only. Enter the **secondary** address. Click **Link wallet**.
- Record the exact displayed amount. Send **exactly** that amount (wei-for-wei) from the
  secondary to the primary using any wallet. Do **not** connect the secondary to ONE and do
  **not** paste a tx hash.
- Confirm automatic detection, that it only occurs after `INDEXER_CONFIRMATIONS`, that the
  10-minute approval state appears, then approve with the primary.
- Confirm the V2 identity exists, both wallets appear on-chain, `/one-v2/<address>` loads on
  another device, and fresh MON/token/NFT balances render.
- Record timings: challenge → broadcast → confirmation → detection → attestation → approval → membership.
- **STOP** if detection fires before the required confirmations, or the amount had to be rounded to send.

## 12. Removal + relink test 🔒
- From the connected primary, **Remove** the linked secondary (confirm the primary itself has
  no Remove control). Confirm the tx succeeds, membership + balances refresh, and the removed
  wallet is free for a new identity. Then relink it via a fresh transfer challenge.
- **STOP** if the primary is removable, or a removed wallet cannot be relinked.

## 13. Expiry + incorrect-amount tests 🔒
- Let a challenge’s 5-minute window expire → confirm it can’t be approved and **Link wallet**
  mints a **new** id + amount. Verify: an incorrect amount is not detected; a late transfer is
  not accepted; the wrong primary cannot approve; wrong-network is handled; a rejected approval
  recovers; duplicate polling produces no duplicate attestation; cron+polling don’t double-process.
- **STOP** on any deviation from the tested design.

## 14. Verification-amount wallet test 🔒
- In each wallet UI available to you, confirm the 6-decimal amount can be entered exactly,
  is not silently rounded, the transferred wei matches, and the 0.01–0.1 MON range feels small.
- Do **not** change the amount algorithm unless a real wallet test shows a UX/precision problem.

## 15. Enable the staging cron 🔒 (only after step 11 detection worked)
- Attach the 1/min Vercel Cron to `/api/v2/link/cron`; confirm `CRON_SECRET` auth (a request
  without the Bearer secret returns 401/503). Confirm the DB scan lease prevents overlap, that
  polling and cron coexist, and that stale `v2_rate_limits` rows are cleaned up by the tick.
- **STOP** if an unauthenticated cron call succeeds, or lease/overlap behaves unexpectedly.

## 16. Complete the staging report
Fill the template in the previous report: staging URL, contract address, deploy tx, verifier
public address, verifierAdmin, Neon migration status, test wallets, verification/approval/removal
tx hashes, timings, redacted logs/screenshots, every issue, every change, and anything still
untested against real infrastructure.

---

**Global stop condition:** if contract state, verifier identity, database state, or transfer
verification ever behaves differently from the tested design, halt immediately and report before
any further step.
