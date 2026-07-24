# Verified ONE V2 — architecture, status, and backend/frontend spec

Transfer-linked secondary wallets. This document is the source of truth for the
V2 build. It records what is implemented and tested, and the exact remaining
infrastructure (indexer, database, frontend) with schema, env vars, deployment,
and security assumptions.

---

## 0. Trust model — read this first

In V2 a **secondary wallet never touches ONE** (no connection, no ONE signature,
no contract call). Control of a secondary is proven **off-chain**: it sends a
bare native-MON transfer to the primary, which ONE's indexer detects.

A link is only written when the primary submits `approveLink` **together with a
signed `LinkAttestation` from the authorised verifier**. The contract
cryptographically verifies that attestation before touching membership, so:

- **A direct `approveLink` with no/invalid verifier signature reverts.** A primary
  calling the contract directly can NOT add an arbitrary wallet — the transfer
  detection is enforced on-chain, not merely gated in the UI. (This closes the
  earlier bypass; see the vulnerability note in the code header and the
  `test_Bypass_*` tests.)
- The attestation is bound to primary, secondary, the exact ONE address,
  challengeId, amount, transfer txHash + block, a deadline, and a verifier nonce;
  the EIP-712 domain binds it to the Monad chain id and this registry. An
  attestation for one primary/secondary/identity/chain/registry is useless for
  another. Each `challengeId` and each `txHash` is single-use.
- The **verifier** is a single immutable authorised key (EOA or, via ERC-1271, a
  multisig). It attests only that a challenge's transfer was observed; it can
  **not** edit memberships, remove wallets, move funds, or upgrade anything.
- On-chain membership therefore proves **primary consent + verifier attestation
  of secondary control**. Trust rests on the verifier honestly attesting real
  transfers; it does not custody funds and cannot forge a link a primary did not
  submit. A secondary added without wanting to be can **self-remove**
  (`removeMember(one, itself)`) — the contract always allows a member to leave.
- The contract **never verifies the transfer directly** (native transfers are
  invisible on-chain — that is the verifier's job) and **never touches funds**:
  the MON moves directly secondary→primary.

---

## 1. Status

| Layer | State |
|---|---|
| **V2 contracts** (`ONERegistryV2`, `ONEIdentityV2`) | **Implemented + tested** — verifier-attestation gated. Foundry `test_Bypass_*` prove direct linking is impossible; contract suite 102/102 (V1 untouched). Gas validated at the 20-member cap. |
| **V1 contracts / app** | **Untouched** — full app suite 750 tests + production build pass. |
| **Backend indexer + database** | **Implemented + tested.** Neon Postgres adapter behind a driver-agnostic `Sql` interface; PGlite integration tests exercise the real schema/constraints. Cron + polling-triggered scan share a DB-backed lease. Cannot be run **end-to-end** here (no provisioned Neon DB, no deployed V2 contract, no live Monad transfer). |
| **Frontend V2 linking flow** | **Implemented.** Mounted at `/verified` (mode switch), removal UI, cross-device profile at `/one-v2/[address]`. Full end-to-end needs a deployed V2 contract + live transfer. |

---

## 2. Contracts (done)

### `ONERegistryV2` (immutable, no admin, no upgrade, no governance)

- **Cap fixed in contract:** `MAX_MEMBERS = 20` (includes primary), `MIN_MEMBERS = 2`.
  No setter, no timelock, no multisig, no coordinator — as decided.
- **`approveLink(secondary)`** — the primary (msg.sender) creates the ONE on first
  use (`{primary, secondary}`), or adds a secondary thereafter. Rejects: self,
  zero, a secondary/primary already active **in V1 or V2**, and the 21st member.
- **Cross-version:** reads the immutable V1 registry's `activeOneOf`. A future V3
  reads V1 **and** V2 the same way. (V1 cannot read V2 — the unavoidable V1
  asymmetry — but a V1 join needs the wallet's own signature, so any V1↔V2 overlap
  is self-inflicted, never third-party.)
- **`removeMember(one, wallet)`** — primary evicts, or a member leaves itself.
  Primary never removable; dropping below 2 permanently deactivates and frees the
  primary; the record stays queryable.
- **Verifier attestation is required for every link.** `approveLink(att,
  verifierSig)` (primary submits) and the hidden `confirmLinkWithSig(att,
  verifierSig, primarySig)` (relayer/ERC-1271, primary co-signs) both verify a
  `LinkAttestation` from the immutable `verifier`. `challengeId` and `txHash` are
  each single-use (`challengeUsed`/`transferUsed`), attestations expire, and the
  attested `one` address is enforced. **`confirmLinkWithSig` is not in the launch UI.**

### Verifier configuration & rotation (implemented)

- The initial `verifier` is a constructor argument; it may be an EOA (the
  indexer's signing key) or an ERC-1271 contract (e.g. a Safe) verified via
  `SignatureChecker`.
- **Rotation is on-chain via `setVerifier(newVerifier)`**, callable **only** by an
  immutable `verifierAdmin` (a designated multisig). **No timelock** — a
  compromised verifier can be revoked immediately. Rejects `address(0)` and emits
  `VerifierChanged(previous, new)`.
- *Why not sibling-redeploy:* an immutable verifier that leaks keeps issuing valid
  attestations against the old registry **forever** — redeployment does not revoke
  it. On-chain rotation makes the old key stop being accepted the instant
  `setVerifier` returns.
- **`verifierAdmin` has no other power whatsoever** — it cannot link or remove
  wallets, modify identities, move funds, change the 20-cap, upgrade, pause, or
  deactivate. Proven by `test_VerifierAdminHasNoOtherAuthority`. Rotation
  preserves all used `challengeId`/`txHash` and all memberships
  (`test_UsedChallengeAndTxSurviveRotation`, `test_MembershipsUnchangedAfterRotation`).
- Attestations from the previous verifier are rejected immediately after rotation;
  attestations from the new verifier are not valid before it
  (`test_OldVerifierRejectedImmediatelyAfterRotation`,
  `test_NewVerifierAcceptedAfterRotation`).
- The `verifierAdmin` multisig should itself be a hardware-backed Safe; its
  compromise is the residual trust root (it could appoint a malicious verifier —
  which still cannot touch existing memberships or funds).
- **Identity deploy:** a real `ONEIdentityV2` per ONE via CREATE2 (salt =
  `keccak256(primary, creationCount[primary])`), so each ONE has its own stable
  address, predictable via `predictIdentityAddress(primary)`.
- **Events:** `OneCreated`, `MemberLinked`, `MemberRemoved`, `IdentityDeactivated`
  — every join/leave is derivable by block/timestamp for Swap Rank and future
  utilities. No Swap Rank logic in V2.

### `ONEIdentityV2` (minimal, stable)

`primaryOwner()`, `getMembers()`, `memberCount()`, `isMember(address)`,
`isActive()`, `version() → 2`. Reads membership from the registry. **No asset
aggregation** — balances are fetched live off-chain, so this contract never needs
to change.

### Gas (validated at 20 members)

`activeOneOf` ~2.6k; `isMemberOf`/loops ~10k at 20; `approveLink` add is O(1)
(its 573k max is the one-time identity deploy, not member count). 20 is safe.

---

## 3. Backend indexer + database (to build — smallest reliable design)

Native MON transfers emit no logs, so detection is by scanning confirmed blocks
and matching `(from, to, exact value)` against active challenges. Challenges must
persist across devices → a database, not browser storage.

### 3.1 Automatic detection flow

1. `POST /api/v2/link/challenge {primary, secondary}` → server validates (valid
   addresses, `primary != secondary`, neither already linked/conflicting via an
   on-chain read of V1+V2), generates a **unique amount**, inserts a `pending`
   challenge, returns `{id, amount, expiresAt}` (5-min expiry).
2. User sends **exactly** `amount` MON from the secondary to the primary in any
   wallet app. No tx hash, no explorer.
3. **Indexer tick** (`GET /api/v2/link/cron`, protected by `CRON_SECRET`) scans
   every **confirmed** block since a persisted cursor and matches transfers to
   `pending` challenges: `from==secondary && to==primary && value==amount &&
   block > created_at_block && now < expires_at && tx unused`. On match →
   `verified`, records `tx_hash`, `tx_block`, `verified_at`, `approval_deadline =
   verified_at + 10 min`.
4. `GET /api/v2/link/challenge/:id` → status, so the UI polls (`pending` →
   `verified` → `linked`/`expired`).
5. On `verified`, UI shows "Approve with primary"; the primary submits
   `approveLink(secondary)` on-chain. The indexer also watches `MemberLinked` to
   mark `linked` (or `approval_deadline` passes → `expired`).

### 3.2 Amount uniqueness (no memo channel)

The amount is the only per-challenge discriminator, so:
- Human-readable base + random low-order digits, e.g. `0.01` + 6 random digits
  (`0.01XXXXXX`), ~10⁶ space, displayed exactly.
- A **DB unique index** on `(secondary, primary, amount)` over active challenges
  guarantees no two live challenges for a pair collide (regenerate on the rare
  clash). Combined with `from/to/time/tx-unused`, an unrelated transfer cannot be
  mistaken for a proof.
- The amount is **not** a security proof — it is a matching key. (This is why the
  contract ignores it entirely.)

### 3.3 Reorg / RPC safety

- Only process blocks at depth ≥ `INDEXER_CONFIRMATIONS` (default 8) so a
  `verified` transfer is final before approval is offered.
- Persist `(last_scanned_block, last_scanned_hash)`; on a hash mismatch at the
  cursor, roll the cursor back and rescan.
- Use the app's existing `withRpcFallback` (primary + fallback RPC). A dropped
  transfer after `verified` cannot corrupt on-chain state — `approveLink` is an
  independent primary action; worst case the UI must restart the attempt.

### 3.4 Database schema (Postgres)

```sql
create table challenges (
  id                uuid primary key default gen_random_uuid(),
  primary_addr      text        not null,
  secondary_addr    text        not null,
  amount_wei        numeric(78,0) not null,      -- exact wei
  created_at        timestamptz not null default now(),
  created_at_block  bigint      not null,
  expires_at        timestamptz not null,        -- created_at + 5 min
  status            text        not null default 'pending', -- pending|verified|linked|expired
  tx_hash           text,
  tx_block          bigint,
  verified_at       timestamptz,
  approval_deadline timestamptz,                 -- verified_at + 10 min
  linked_at         timestamptz
);
-- No two live challenges for a pair may share an amount.
create unique index uniq_active_amount on challenges (secondary_addr, primary_addr, amount_wei)
  where status in ('pending','verified');
-- A transfer backs at most one verification.
create unique index uniq_tx on challenges (tx_hash) where tx_hash is not null;

create table indexer_cursor (
  id                 int  primary key default 1,
  last_scanned_block bigint not null,
  last_scanned_hash  text
);
```

### 3.5 Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (Neon/Vercel Postgres/marketplace). **New dependency.** |
| `NEXT_PUBLIC_ONE_REGISTRY_V2_ADDRESS` | Deployed `ONERegistryV2` address. |
| `MONAD_MAINNET_RPC_URL`, `MONAD_MAINNET_FALLBACK_RPC_URL` | Already used by the app. |
| `CRON_SECRET` | Authorizes the indexer tick endpoint. |
| `INDEXER_CONFIRMATIONS` | Reorg depth (default 8). |
| `VERIFIER_PRIVATE_KEY` | **Server-only.** The verifier signing key — must recover to the registry's immutable `verifier`. Never `NEXT_PUBLIC_`, never logged. Its public address is what `ONERegistryV2` was constructed with. Prefer a KMS/HSM or an ERC-1271 multisig verifier in production. |

After a challenge reaches `verified`, the backend signs a `LinkAttestation`
(EIP-712, domain `("ONE Link","1", 143, registryV2)`) over
`{primary, secondary, one, challengeId, amount, txHash, txBlock, deadline,
verifierNonce}` with `VERIFIER_PRIVATE_KEY`, and the `GET .../challenge/:id`
response returns the attestation + signature. The frontend passes both to
`approveLink`. The contract enforces them — so this is the first ONE component
that holds a signing key; treat it as such (KMS/HSM or multisig verifier).

### 3.6 Where it runs

Vercel serverless can't hold a long-lived poller. Smallest option: a **Vercel
Cron** hitting `/api/v2/link/cron` every 1 minute, batch-scanning all new
confirmed blocks since the cursor (≈120 Monad blocks/run; detection latency ≤ ~1
min, well inside the 5-min window). Lower latency (a dedicated worker on
Railway/Fly) is optional. **This is ONE's first backend state + database** — a
deliberate posture change from the prior browser-only model.

---

## 4. Frontend V2 flow (to build — one visible method only)

Connect primary → paste secondary → **Link wallet** → "Send exactly `X` MON from
`0xsecondary…` to your primary `0xprimary…` (any wallet)" + 5-min countdown →
poll → **Transfer confirmed** → **Approve with primary** (`approveLink`, 10-min
window) → **Wallet linked**. Expiry → "Link wallet again (new amount)". Repeat
per secondary. Removal: primary clicks Remove → confirm → `removeMember` →
refresh. Profile: open a ONE V2 address → read `getMembers()` → fetch live
balances via the existing aggregation (never stored on-chain). The
`confirmLinkWithSig` path is not shown. Must not touch watch-only portfolios,
saved addresses, or token/NFT features.

---

## 5. Deployment steps

1. `cd contracts && forge build && forge test` (green).
2. Deploy `ONERegistryV2(v1RegistryAddress, verifierAddress, verifierAdmin)` to
   Monad Mainnet (verifierAddress = public address of `VERIFIER_PRIVATE_KEY` or an
   ERC-1271 multisig; verifierAdmin = the rotation multisig, a hardware-backed
   Safe); Sourcify-verify; regenerate the app ABI
   (`node script/generate-app-abi.mjs`) to add the V2 ABI.
3. Provision Neon Postgres (Vercel Marketplace); set env vars (3.5). Run the
   migration once:

   ```sh
   psql "$DATABASE_URL" -f app/migrations/v2link_001_init.sql
   ```

   The file is idempotent (`IF NOT EXISTS`); rollback SQL is at its foot. The app
   does **not** auto-migrate, and with `DATABASE_URL` set it never falls back to
   in-memory storage.
4. Add the Cron entry for `/api/v2/link/cron` (1/min) with `CRON_SECRET`. The
   cron route **fails closed** (503) if `CRON_SECRET` is unset.
5. Ship the frontend flow behind the V2 address env.

### 5.1 Execution model (implemented)

- **Cron** (`GET /api/v2/link/cron`, `Bearer $CRON_SECRET`) runs the indexer tick
  every minute.
- **Polling also drives detection:** the status route (`GET
  /api/v2/link/challenge/[id]`) triggers an idempotent scan while a challenge is
  still `pending`, so detection latency is far below the 1-minute cron cadence.
- **DB-backed scan lease** (`v2_scan_lease`, atomic `update … where locked_until
  < now`) serialises cron and polling scans — a range is never processed twice
  and the verifier never double-signs. A skipped scan returns `{ skipped: true }`.
- **Rate limiting** (in-memory token bucket, per instance): challenge creation
  (5 burst / 0.2 rps) and status polling (30 burst / 1 rps). Defense-in-depth
  only; the hard guarantees are the DB unique indexes + the contract.
- **Error redaction:** all API error bodies pass through `safeErrorMessage`,
  which strips `DATABASE_URL` / `VERIFIER_PRIVATE_KEY` / `CRON_SECRET` values plus
  any connection-string or 32-byte-hex pattern.

---

## 6. Security assumptions

- **Trusted verifier, enforced on-chain:** the backend verifier attests secondary
  control and the contract **requires** that attestation — a primary can NOT
  bypass it by calling the contract directly (`test_Bypass_*`). Trust is that the
  verifier only attests real, detected transfers. A wallet's recourse against a
  dishonest link is self-removal.
- **Verifier signing key (new for ONE), no custody:** the backend holds
  `VERIFIER_PRIVATE_KEY`; protect it (KMS/HSM or ERC-1271 multisig verifier). The
  contract still holds no funds — the MON moves directly secondary→primary.
- **Replay/reuse/collision:** on-chain single-use `challengeId` + `txHash`,
  attestation deadline, chain/registry-bound domain; off-chain unique amount (+ DB
  constraint), N-confirmations, 5-min challenge / 10-min approval windows.
- **Immutability:** no admin, no upgrade, no governance in V2. The only trust root
  is the immutable `verifier` (rotation = sibling redeploy, or the optional narrow
  `setVerifier` if chosen).

### Product copy — do NOT say "No funds move"

The verification amount **moves** directly from the secondary wallet to the
primary wallet. Say instead: *"You send a small amount of MON from the secondary
wallet to your own primary wallet. ONE never receives, holds, forwards, or
controls it — it stays in your primary."* V2's linking flow must not reuse V1's
"No funds move" line.

---

## 7. Off-chain test matrix (belongs to the backend, needs the DB/indexer)

challenge expiry (5 min), approval expiry (10 min), wrong sender/recipient/amount,
failed tx, reused tx, reused challenge, concurrent challenges, **backend restart
persistence** (cursor + challenges survive), **reorg/confirmation handling**.
Implement as integration tests against a test Postgres with a mocked RPC. The
on-chain matrix (duplicate membership, V1 conflict, 20-cap, primary-removal
prevention, secondary removal, relink, replay, ERC-1271, concurrency) is already
covered by `test/ONERegistryV2.t.sol`.
