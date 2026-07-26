# Verified ONE V2 — Status Briefing (staging)

_Snapshot as of the `v2-staging-validated-1` milestone. Staging only — not merged
to main, not on production._

## What it is
"ONE" is a watch-only + verified-identity app on **Monad Mainnet (chainId 143)**.
**Verified ONE V2** is a new way to link multiple wallets you control into one
public on-chain identity, **without the wallet being added ever connecting to the
app, signing, or touching the ONE contract**.

**How linking works:** You connect only your **primary** wallet. You enter a
secondary wallet's address. The app gives you an exact small amount of MON to send
**from the secondary wallet to your own primary wallet**. An off-chain detector
notices that transfer (no transaction hash needed from the user), a server-side
**verifier** signs an EIP-712 attestation, and the **primary** submits one
on-chain `approveLink` transaction. The transferred MON stays in the primary; ONE
never receives, holds, or controls funds.

This differs from **V1**, where every wallet signs a gasless EIP-712
authorization. V2's `/verified` page is now **transfer-only** (the V1 "each wallet
signs" method was removed from that page; V1 contracts/data still exist
independently).

## Trust model
An on-chain link requires **both**: (1) the primary's consent (it submits the
tx), and (2) a **verifier attestation** the contract enforces, cryptographically
bound to primary, secondary, ONE identity address, challengeId, exact amount, tx
hash, tx block, deadline, chainId, registry address, and a verifier nonce. Direct
calls to `approveLink` can't bypass this (proven by contract tests). The verifier
key can be rotated via `setVerifier`, callable only by an immutable `verifierAdmin`
multisig with no other powers and no timelock (emergency-capable).

## Contracts (Solidity 0.8.28, Foundry, EVM shanghai, optimizer 200 runs)
- **`ONERegistryV2`** — immutable, no governance/upgradeability. Verifier-attested
  linking; creates a minimal per-identity `ONEIdentityV2` via CREATE2.
  `MAX_MEMBERS = 20` (fixed, includes primary), `MIN_MEMBERS = 2`, `VERSION = 2`.
  Reads the immutable V1 registry to reject wallets already in V1. Members can be
  removed (primary or the wallet itself); primary is never removable; dropping
  below MIN deactivates the identity.
- **`ONEIdentityV2`** — minimal membership record
  (primaryOf/getMembers/memberCount/isMember/isActive), no asset aggregation.
- **EIP-712 domain:** name `"ONE Link"`, version `"1"`, chainId 143,
  verifyingContract = the registry.
- Contract test suite: **102 tests** (incl. bypass-impossibility and
  verifier-rotation), plus 9 deploy/verify-script simulation tests.

## Backend (Next.js 16 App Router, TypeScript, viem)
- **Challenge lifecycle:** `pending → verified → linked`, or `expired`/`cancelled`.
  5-minute transfer window, 10-minute approval window, 8-block confirmation depth.
- **Verification amount:** exact wei, no floating point. Range 0.01–0.1 MON,
  aligned to a **6-decimal step** (1e12 wei) → 90,000 distinct values; the
  displayed amount round-trips exactly to the wei (so wallets can't silently round
  it).
- **Detector (indexer):** native MON transfers emit no logs, so it scans confirmed
  blocks matching (recipient = primary, exact value), then validates
  sender/value/confirmations. It runs on every status poll (~5s) **and** can run
  on a 1/min cron; a DB-backed lease serializes them. The scan starts from the
  challenge's own block (not a global cursor), so it never lags on Monad's fast
  blocks.
- **Verifier signing:** server-only key (`VERIFIER_PRIVATE_KEY`), never sent to the
  browser; signs only after the transfer is independently detected + confirmed.
- **Database:** **Neon Postgres** (via `@neondatabase/serverless`), driver-agnostic
  `Sql` interface; **PGlite** (real in-process Postgres) for integration tests.
  Two idempotent migrations. Guarantees: one active challenge per primary+secondary
  pair (amount-independent), amount unique per recipient, unique verifier nonce,
  single-use transfer hash, scan lease, cursor persistence. DB-backed rate limiting
  (token bucket, shared across serverless instances). No silent fallback to
  in-memory when `DATABASE_URL` is set.
- API routes: `POST /api/v2/link/challenge` (create),
  `GET/DELETE/POST /api/v2/link/challenge/[id]` (status+poll-scan / cancel /
  mark-linked), `GET /api/v2/link/cron` (indexer, CRON_SECRET-gated, fails closed).

## Frontend
- **`/verified`** — transfer-only. Connect primary → enter wallet → "Link wallet" →
  send exact MON → auto-detect (with an "I've sent it — check now" button) →
  approve with primary → linked. Countdowns, and full error/expiry handling (wrong
  network, wrong primary, rejected/reverted approval, expiry). Technical terms
  (attestation, verifier, indexer, EIP-712) are hidden from copy.
- **"Your active ONE" card** — when the connected wallet is already in a V2
  identity: identity address, role, linked-wallet count, active status, and
  View/Copy buttons → `/one-v2/<address>`.
- **Wallet management** — remove per linked wallet (primary submits `removeMember`,
  waits for receipt, refreshes); primary itself never removable.
- **`/one-v2/[address]`** — public, cross-device profile: reads membership straight
  from the V2 registry (no browser storage) and loads live MON/token/NFT balances
  via the existing watch-only path.
- **Public lookup** — the homepage "Look up a Verified ONE" now finds V2
  identities (falls through to V2 when V1 has no match).
- **Wallet UX** — one shared wallet instance across the page; connect forces the
  account picker (`wallet_requestPermissions`); injected connections
  (MetaMask/Rabby/Backpack) persist across refresh and only clear on explicit
  Disconnect.

## Deployed staging config (Monad Mainnet, public addresses)
- **ONERegistryV2 (staging):** `0x2df1b222d48859c3E3CD217B78Ac29966901485E`
- Constructor: v1Registry `0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`,
  verifier `0x241b18cb3f27105fA4Cb6d85cdcb254ECe9E3d78`,
  verifierAdmin `0xfdC6D010C7A28AbC5D3fBA575Fa3e0f18c82b363`.
- Deployer: `0x017F9358AFcC7018dd683001FD33fD7D68230D8B`. Deployed via Remix +
  MetaMask; validated read-only on-chain (all wiring, cap, version, EIP-712 domain
  match).
- **Infra:** Neon Postgres (migrated); Vercel **Preview** deployment
  (Preview-scoped env vars only; production `oneidentity.app` untouched; Vercel
  Authentication on).
- Env vars: `DATABASE_URL`, `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS`,
  `VERIFIER_PRIVATE_KEY` (server-only), `CRON_SECRET`, `MONAD_MAINNET_RPC_URL`,
  `INDEXER_CONFIRMATIONS`.

## Validated end-to-end on the live staging preview
Link-by-transfer with auto-detection (no tx hash) → primary approval → identity
created; **adding more wallets** to an existing ONE; **remove + relink** the same
wallet (fresh flow); reconnect account-picker + connection **surviving refresh**;
the V2 "Your active ONE" card; **public lookup** finding V2 identities.

## Bugs found & fixed during staging
Shared wallet state (button stayed disabled after connect); relink resumed a stale
"verified" state; **indexer cursor lag** (a real transfer expired undetected on
Monad's fast blocks); the primary of an existing ONE couldn't add more wallets;
the public lookup was V1-only.

## Still open / not done
- **Header connect button** (move connect to the header; needs a shared-wallet
  context) — not started.
- Homepage "EXAMPLE" card still shows a V1 identity (hardcoded demo).
- **Cron not enabled** (polling detection is sufficient; cron is an optional
  backup).
- **Not merged to main, not on production.**

## Repo / stack
- Repo `github.com/cryptobro-nad/oneidentity`, branch **`feature/verified-one-v2`**,
  milestone tag **`v2-staging-validated-1`**.
- Stack: Next.js 16 (App Router), TypeScript, viem, Foundry, Neon Postgres, Vitest
  (+ PGlite), Vercel.
- Test status: **780 app tests**, **102 contract tests**, lint, typecheck,
  production build — all green.

## Related docs
- `docs/verified-one-v2.md` — full architecture, trust model, DB schema, security.
- `docs/verified-one-v2-staging-runbook.md` — the 16-step staging deployment
  checklist.
