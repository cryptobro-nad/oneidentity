# ONE — Monad Mainnet Deployment

Deployment runbook and record for `ONERegistry`.

> ## ✅ Status: DEPLOYED AND SOURCE-VERIFIED
>
> **Registry: [`0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`](https://monadscan.com/address/0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915)**
> on Monad Mainnet (chain 143), block 88,632,853.
> Sourcify reports **`exact_match`** on both creation and runtime bytecode.
> See [§16 Deployment record](#16-deployment-record).
>
> No ONE identity has been created. `totalOnes()` is 0.

---

## 1. Deployment target

| | |
|---|---|
| Network | Monad Mainnet |
| Chain ID | **143** (`0x8f`) — verified live |
| Primary RPC | `https://rpc.monad.xyz` |
| Fallback RPC | `https://rpc3.monad.xyz` |
| Native currency | MON (18 decimals) |
| Explorers | [MonadVision](https://monadvision.com) · [Monadscan](https://monadscan.com) |

The deploy script hard-aborts with `WrongChain(143, actual)` if
`block.chainid != 143`, before any broadcast occurs.

## 2. Chain ID

**143.** Confirmed live via `cast chain-id --rpc-url https://rpc.monad.xyz`
during preparation. Re-confirm before every run — step 1 of the checklist.

Note: Foundry has **no built-in alias** for Monad — `cast chain` returns
`unknown`. Chain-specific URLs must therefore be passed explicitly rather than
inferred from `--chain`.

## 3. Contracts being deployed

**`ONERegistry` only.** One contract, one transaction, no constructor arguments.

| | |
|---|---|
| Source | `contracts/src/ONERegistry.sol` |
| Fully qualified name | `src/ONERegistry.sol:ONERegistry` |
| Constructor args | **none** (`constructor() EIP712("ONE", "1")`) |
| Creation bytecode | 11,354 bytes |
| Runtime bytecode | 10,458 bytes |
| Creation-code keccak | `0x6c858964421287e8e261ff8a0baaf67c4d934419958c7d52f385da631d47059e` |

## 4. Contracts NOT deployed manually

**`ONEIdentity` must never be deployed by hand.**

Identities are created exclusively by `ONERegistry.createOne()` via CREATE2,
salted with `keccak256(primary, membersHash, salt)`. A hand-deployed identity
would have no registry record, so `primaryOf` / `membersOf` / `isActive` would
all revert `UnknownOne` and the contract would be permanently inert.

The deploy script also **never calls `createOne()`**. Creating a ONE binds real
wallets to the registry permanently; that is a user action, not a deployment step.

For reference, the identity creation-code hash (constructor arg zeroed) is
`0x406708aaca577bda79857cf09150436783d172175adc347cc4838f27c221888a`.

## 5. Security rules

1. **No plaintext private key.** Not in source, `.env`, `.env.example`, shell
   scripts, docs, git history, terminal output, or test fixtures.
2. **Broadcast only from an encrypted Foundry keystore** (`--account`), which
   prompts for a password at signing time.
3. `contracts/.env.example` deliberately has **no `PRIVATE_KEY` field**. Only
   the *public* deployer address is ever configured.
4. `contracts/broadcast/` and `contracts/cache/` are gitignored. Foundry writes
   *"Sensitive values saved to cache/…"* on every run — that path must never be
   committed.
5. Never paste a seed phrase anywhere. Importing a key is done by you, locally.

## 6. Keystore setup

Run this yourself, once. **Claude does not run this and never sees the key.**

```bash
cast wallet import one-deployer --interactive
```

It prompts for the private key (hidden) and a password, then writes an encrypted
keystore to `~/.foundry/keystores/one-deployer`. Confirm it:

```bash
cast wallet list
cast wallet address --account one-deployer     # prompts for password
```

Every later command uses `--account one-deployer`. The key never touches disk in
plaintext and never appears in shell history.

## 7. Public deployer-address check

```bash
cast wallet address --account one-deployer
```

Record the address. Confirm it matches the wallet you intend to fund, then set:

```bash
# contracts/.env  — public address only
ONE_DEPLOYER_ADDRESS=0x...
```

## 8. MON balance check

```bash
cast balance <DEPLOYER_ADDRESS> --rpc-url https://rpc.monad.xyz
cast balance <DEPLOYER_ADDRESS> --rpc-url https://rpc.monad.xyz --ether
```

### Cost analysis

Measured deployment gas: **2,322,525** (exact, from a full rehearsal — identical
to the `forge test --gas-report` figure). Forge sets a gas *limit* of 3,019,282.

Monad Mainnet base fee was a flat **100 gwei** across every sample taken during
preparation; `eth_gasPrice` returned **102 gwei**.

> ## ⚠️ Monad charges the gas LIMIT, not gas used
>
> This is a real behavioural difference from Ethereum and it changes every cost
> estimate. From the official docs:
>
> > *"Transactions are charged based on gas limit rather than gas usage, i.e.
> > total gas deducted from the sender's balance is `value + gas_bid * gas_limit`."*
> > — <https://docs.monad.xyz/developer-essentials/differences>
>
> The actual deployment confirms it. The EVM consumed **2,322,525** gas, but the
> receipt reports `gasUsed = 3,043,418` — exactly the gas *limit* Forge set — and
> the charge was `3,043,418 × 102 gwei = 0.310428636 MON`.
>
> **Consequence: an over-generous gas limit costs real money on Monad.** Budget
> against the limit, never against expected consumption. This matters most for
> Phase 2, where `createOne()` ranges 23k–1.16M gas depending on member count;
> a fixed worst-case limit would overcharge every small ONE.

Cost is `gas_limit × gas_price`. Forge sets the limit at ~3,043,418 for this
deployment.

| Scenario | Gas price | Charged (limit × price) |
|---|---|---|
| **Actual deployment** | **102 gwei** | **0.310428636 MON** ✅ |
| Forge estimate (2× base) | 202 gwei | 0.6148 MON |
| Stress: 3× base | 300 gwei | 0.9130 MON |
| Stress: 5× base | 500 gwei | 1.5217 MON |

> ### Recommended minimum deployer balance: **2 MON**
>
> Actual cost was 0.3104 MON. 2 MON covers a 5× fee spike with room for a retry.
> The wallet was funded with 5 MON and retained ~4.69 MON.

## 9. Dry-run command

Simulation only — **no `--broadcast`, so nothing is sent**:

```bash
cd contracts
forge script script/DeployONERegistry.s.sol:DeployONERegistry \
  --rpc-url https://rpc.monad.xyz \
  --sender <DEPLOYER_ADDRESS>
```

`--sender` makes the simulation report the real deployer's nonce and predicted
address. Without it Foundry substitutes a default sender and the predicted
address will be wrong.

## 10. Broadcast command

**Do not run until every checklist item in §11 passes.**

```bash
cd contracts
forge script script/DeployONERegistry.s.sol:DeployONERegistry \
  --rpc-url https://rpc.monad.xyz \
  --account one-deployer \
  --broadcast
```

You will be prompted for the keystore password. Add `--slow` if you want the
transaction submitted and confirmed one at a time (there is only one here).

If the primary RPC is unhealthy, substitute `--rpc-url https://rpc3.monad.xyz`.

## 11. Verification commands

Compiler settings must match the build **exactly**. They are pinned in
`foundry.toml` and were not altered for verification convenience.

| Setting | Value |
|---|---|
| Solidity | `0.8.28` (`0.8.28+commit.7893614a`) |
| EVM version | `shanghai` |
| Optimizer | enabled, **200 runs** |
| via_ir | `false` |
| OpenZeppelin | `5.1.0` |
| Constructor args | none |

### MonadVision (Sourcify) — no API key required

```bash
forge verify-contract <REGISTRY_ADDRESS> src/ONERegistry.sol:ONERegistry \
  --chain 143 \
  --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --compiler-version 0.8.28 \
  --num-of-optimizations 200
```

### Monadscan (Etherscan-compatible) — API key required

```bash
forge verify-contract <REGISTRY_ADDRESS> src/ONERegistry.sol:ONERegistry \
  --chain 143 \
  --verifier etherscan \
  --verifier-url "https://api.etherscan.io/v2/api?chainid=143" \
  --etherscan-api-key "$EXPLORER_API_KEY" \
  --compiler-version 0.8.28 \
  --num-of-optimizations 200 \
  --watch
```

`--verifier-url` is passed explicitly because Foundry does not recognise chain
143 and cannot infer the endpoint. Monad is listed in the Etherscan V2 chainlist
under chain 143 with `status: 1` (confirmed during the mainnet data spike).

**No `--constructor-args` flag is needed** — the constructor takes no arguments.

> **Note on `metadata_hash`.** The official Monad docs suggest setting
> `metadata_hash = "none"` and `use_literal_content = true` in `foundry.toml` to
> smooth verification. **These were deliberately not applied**: `metadata_hash`
> changes the emitted bytecode, which would invalidate the recorded creation-code
> hash and every gas figure measured against `contract-spike-v1`. Verification
> succeeds without it (Sourcify may report a *partial* rather than *full* match).
> If you would rather have a full Sourcify match, change it **before** deploying
> and re-run the whole verification sequence — never after.

### Official documentation used

- Network config, RPC list, canonical contracts —
  <https://docs.monad.xyz/developer-essentials/network-information>
- Foundry verification commands (mainnet 143, Sourcify + Etherscan paths) —
  <https://docs.monad.xyz/guides/verify-smart-contract/foundry>
- Foundry deployment / keystore pattern —
  <https://docs.monad.xyz/guides/deploy-smart-contract/foundry>

Retrieved 2026-07-18. Note the deploy guide's examples are testnet-oriented
(chain 10143); mainnet values above come from the network-information and
verification pages.

## 12. Post-deployment checks

Run all three, in order.

### a. On-chain state and EIP-712 domain

```bash
cd contracts
ONE_REGISTRY_ADDRESS=<REGISTRY_ADDRESS> \
forge script script/VerifyONERegistry.s.sol:VerifyONERegistry \
  --rpc-url https://rpc.monad.xyz
```

Reverts if anything is wrong. It checks: bytecode present; `MIN_MEMBERS == 2`;
`MAX_MEMBERS == 5`; `totalOnes == 0`; and, for two independent probe addresses,
`exists() == false`, `activeOneOf() == address(0)`, `nonces() == 0`. It then
reads the ERC-5267 `eip712Domain()` and asserts name `ONE`, version `1`,
chainId `143`, and `verifyingContract == registry`.

> **API note.** The functions named in the original task spec as `isOne(x)` and
> `activeOneOfPrimary(x)` **do not exist** on `ONERegistry`. The real equivalents
> are `exists(x)` and `activeOneOf(x)`. `activeOneOf` already covers the primary:
> `_record()` binds *every* member including the primary, so there is no separate
> primary index to check. The contracts were not modified to match the spec.

### b. Raw manual checks

```bash
cast code <REGISTRY_ADDRESS> --rpc-url https://rpc.monad.xyz | head -c 80
cast call <REGISTRY_ADDRESS> "totalOnes()(uint256)"            --rpc-url https://rpc.monad.xyz
cast call <REGISTRY_ADDRESS> "exists(address)(bool)"      0x…  --rpc-url https://rpc.monad.xyz
cast call <REGISTRY_ADDRESS> "activeOneOf(address)(address)" 0x… --rpc-url https://rpc.monad.xyz
cast call <REGISTRY_ADDRESS> "nonces(address)(uint256)"   0x…  --rpc-url https://rpc.monad.xyz
```

### c. Runtime bytecode vs local artifact

```bash
cd contracts
node script/check-runtime-bytecode.mjs <REGISTRY_ADDRESS> https://rpc.monad.xyz
```

> **Why a plain hash comparison fails.** `ONERegistry` inherits OpenZeppelin's
> `EIP712`, which holds **seven immutables** (`_cachedThis`,
> `_cachedDomainSeparator`, `_cachedChainId`, `_hashedName`, `_hashedVersion`,
> `_name`, `_version`). Immutables are zero-filled placeholders in the compiled
> artifact and written at construction. Two of them derive from the deployed
> address, so on-chain runtime bytecode **necessarily differs** from
> `deployedBytecode.object` — and differs per deployment.
>
> Comparing raw runtime hashes therefore always reports a mismatch and proves
> nothing. The script masks the compiler-recorded immutable regions on both
> sides, compares the remainder, and prints the recovered immutable values.
> The address-independent integrity check is the **creation** bytecode hash.
>
> This was validated end-to-end against the real deployment. The on-chain
> immutables decode exactly as expected: `_cachedThis` =
> `0x…f8e62d8d16acb49eeeecf13de48f1f6898c2f915` (the registry itself),
> `_cachedChainId` = `0x8f` (143), and `_cachedDomainSeparator` =
> `0x960c5a75…1141e184`, matching the value read live from `eip712Domain()`.

#### Windows: libuv assertion after PASS (fixed)

An earlier revision of the checker printed `PASS` and then died with:

```text
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

**It exited `-1073740791` (`0xC0000409`, Windows fail-fast) despite passing** —
a green result with a red exit status, which CI would score as a failure and a
human would likely miss.

Root cause, isolated with a minimal reproduction on Node v24.14.1 / Windows:

| Requests | Exit method | Result |
|---|---|---|
| 2 | `process.exit(0)` | assertion, exit `-1073740791` |
| 2 | `process.exitCode = 0` | clean exit `0` |
| 1 | `process.exit(0)` | clean exit `0` |

Node's built-in `fetch` (undici) returns sockets to a **keep-alive pool**, so
from the *second* request onward a pooled socket owns a live libuv async handle.
`process.exit()` tears the loop down synchronously, hitting the handle mid-close
and tripping libuv's assertion. One request never populates the pool, so it does
not reproduce — which is why this only appeared against a real deployment
(`eth_chainId` + `eth_getCode`) and not in simpler tests.

**Attribution:** the assertion/abort is an upstream Node/libuv defect on Windows
— a clean `process.exit()` should not fault. But the trigger was ours and was
trivially avoidable, so it is fixed in our script rather than merely documented.

**Fix:** `check-runtime-bytecode.mjs` now sets `process.exitCode` and lets the
event loop drain; it never calls `process.exit()`. All paths were re-verified:
PASS → `0`, no-bytecode → `1`, bad usage → `1`. Do not reintroduce
`process.exit()` there.

**Alternative that avoids Node entirely.** If you hit any variant of this, the
same runtime bytecode can be compared with `cast` plus the artifact:

```bash
# On-chain runtime code
cast code 0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915 --rpc-url https://rpc.monad.xyz > onchain.hex

# Local artifact runtime code
jq -r '.deployedBytecode.object' out/ONERegistry.sol/ONERegistry.json > local.hex

# Sizes must match (10458 bytes). Bytes differ only in the 7 immutable slots,
# so a raw diff is EXPECTED to show differences at offsets 4447/4496/4862/
# 4904/4946/5027/5067 and nowhere else.
```

The strongest single check needs no tooling at all: **Sourcify already reports
`exact_match` on both creation and runtime bytecode** (§16), which is a superset
of what this script proves.

## 13. Rollback limitations

**There is no rollback. Deployment is irreversible.**

- `ONERegistry` is deployed directly, **not behind a proxy**, and is **not
  upgradeable**. This was a deliberate architecture decision.
- There is no owner, no admin, no pause, and no selfdestruct. Nobody — including
  the deployer — can modify, halt, or remove the contract after deployment.
- A bug can only be addressed by deploying a **new** registry and repointing the
  frontend. ONEs created against the old registry stay there permanently and
  cannot be migrated: `ONEIdentity` stores its registry as an `immutable`.
- The deployer address has **no privileges whatsoever** post-deployment. It is
  not special-cased anywhere in the contract.

Consequence: verify thoroughly *before* broadcasting. The checklist in §11 is
the last reversible point.

## 14. Required frontend environment variables

Recorded, now that deployment and source verification are complete.

The address is committed as a default in `app/src/lib/chain.ts`
(`ONE_REGISTRY_ADDRESS`), alongside the pinned EIP-712 domain
(`ONE_REGISTRY_DOMAIN`). `app/.env.example` documents the public overrides:

```bash
# app/.env.local — all values PUBLIC, no secrets
NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
NEXT_PUBLIC_MONAD_FALLBACK_RPC_URL=https://rpc3.monad.xyz
NEXT_PUBLIC_ONE_REGISTRY_ADDRESS=0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915
```

**Phase 1 does not read the registry.** The unverified portfolio only reads
wallet balances, so nothing in the shipped app calls this address yet. It is
configured now so Verified ONE starts from a reviewed constant rather than a
pasted literal. `ONE_REGISTRY_DOMAIN.expectedSeparator` is there to be
*asserted against the chain* before any signature is requested — treat it as a
value to verify, not to trust.

## 15. Deployment record template

```text
Network:
Chain ID:
Deployer:
Registry address:
Transaction hash:
Block number:
Gas used:
MON cost:
Compiler:
Commit:
Explorer:
Source verified:
Deployment time:
```

## 16. Deployment record

**Final. Every field below was read back from the chain, not copied from
console output.**

```text
Network:            Monad Mainnet
Chain ID:           143
Deployer:           0xF361d6aD3d25Ed5fA797FF2B40cCDB7842c0DA86
Registry address:   0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915
Transaction hash:   0x317153a9131d77d77f65714d70b98caf212f49f8ca6e031c5f8eed461ac932f2
Block number:       88632853
Gas used:           3043418 (receipt; = gas LIMIT — Monad charges the limit)
MON cost:           0.310428636 MON  (3043418 x 102 gwei)
Compiler:           solc 0.8.28+commit.7893614a, optimizer 200 runs, evm shanghai
Commit:             471f9a98bf190bb3dcb5274f20b9dbb246fcb588
Explorer:           https://monadscan.com/address/0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915
Source verified:    YES - Sourcify exact_match (creation + runtime)
Deployment time:    2026-07-18T20:43:53Z (source verified at)
```

### Receipt (read from chain)

| Field | Value |
|---|---|
| `status` | **1 (success)** |
| `blockNumber` | 88,632,853 |
| `gasUsed` | 3,043,418 |
| `effectiveGasPrice` | 102 gwei (`102000000000`) |
| `cumulativeGasUsed` | 10,459,478 |
| `contractAddress` | `0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915` |
| `from` | `0xF361d6aD3d25Ed5fA797FF2B40cCDB7842c0DA86` |
| Deployer nonce after | 1 |

The deployed address matches the pre-computed prediction from
`cast compute-address <deployer> --nonce 0` exactly.

### Post-deployment verification

| Check | Result |
|---|---|
| Runtime bytecode present | 10,458 bytes ✅ |
| Runtime vs local artifact (immutables masked) | **PASS**, exit 0 ✅ |
| Creation bytecode | `0x6c858964…d47059e` ✅ |
| EIP-712 name / version | `ONE` / `1` ✅ |
| EIP-712 chainId | 143 ✅ |
| EIP-712 verifyingContract | = registry ✅ |
| Domain separator | `0x960c5a75782e99137e7ed08ee5f3b96ce7f2a37516829ba3541f78e21141e184` |
| `JOIN_ONE_TYPEHASH` | `0xb374db42013b92adfb78ac6714742925733494dfad7bb318eed19df9edeee2ba` |
| `totalOnes()` | 0 — **no ONE identity created** ✅ |
| Probe `exists()` / `activeOneOf()` / `nonces()` | `false` / `0x0` / `0` ✅ |

### Source verification result

Verified via the **Sourcify / MonadVision** path — no API key required.

```text
Verification Job ID : 4c18e75a-603b-4c14-afe8-b0fe433451ba
match               : exact_match
creationMatch       : exact_match
runtimeMatch        : exact_match
matchId             : 543769
verifiedAt          : 2026-07-18T20:43:53Z
compilationTime     : 420 ms
```

- Sourcify record:
  <https://sourcify-api-monad.blockvision.org/v2/contract/143/0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915>
- Explorer: <https://monadscan.com/address/0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915>
- MonadVision: <https://monadvision.com/address/0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915>
  (the HTML page returns 403 to scripted requests due to bot protection; the
  Sourcify API above is the authoritative record)

**`exact_match` was achieved with the compiler settings unchanged.** The Monad
docs' suggested `metadata_hash = "none"` was *not* required — it would have
altered the emitted bytecode for no benefit here. Monadscan/Etherscan
verification was not run because Sourcify already produced a full match and
requires no API key; the command remains available in §11 if a Monadscan-native
badge is wanted later.

---

# Mainnet deployment checklist

Every box must be ticked **before** adding `--broadcast`.

- [ ] All **63 contract tests pass** — `forge test` reports `63 passed`
- [ ] `forge build` passes with no errors
- [ ] `forge fmt --check` passes
- [ ] Git working tree is clean — `git status --short` is empty
- [ ] HEAD commit recorded — `git rev-parse HEAD`
- [ ] Chain ID returns **143** — `cast chain-id --rpc-url https://rpc.monad.xyz`
- [ ] Deployer public address confirmed — `cast wallet address --account one-deployer`
- [ ] Deployer balance ≥ **2 MON** — `cast balance <ADDR> --ether --rpc-url …`
- [ ] Deployment gas simulated with the **real `--sender`**
- [ ] Registry bytecode artifact recorded — creation-code keccak
      `0x6c858964421287e8e261ff8a0baaf67c4d934419958c7d52f385da631d47059e`
- [ ] **No private key anywhere in git history** — see command below
- [ ] Verification command prepared (§11), API key present if using Monadscan
- [ ] Frontend **not** pointed at a guessed address

### Private-key history scan

```bash
# Should return nothing.
git log -p --all | grep -nE '(PRIVATE_KEY|0x[a-fA-F0-9]{64})' || echo "clean"
git log --all --name-only --pretty=format: | sort -u | grep -E '(^|/)\.env$' || echo "no .env tracked"
```
