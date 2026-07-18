# ONE — Monad Mainnet Deployment

Deployment runbook for `ONERegistry`. Nothing in this document has been
broadcast. Everything below was rehearsed against a local chain pinned to
chain ID 143 and simulated against live Monad Mainnet.

**Status: prepared and simulated. Not deployed.**

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

| Scenario | Gas price | Cost at gas used | Cost at gas limit |
|---|---|---|---|
| Current network price | 102 gwei | **0.2369 MON** | 0.3080 MON |
| Forge estimate (2× base) | 202 gwei | **0.4692 MON** | 0.6099 MON |
| Stress: 3× base | 300 gwei | 0.6968 MON | 0.9058 MON |
| Stress: 5× base | 500 gwei | 1.1613 MON | 1.5096 MON |

> ### Recommended minimum deployer balance: **2 MON**
>
> Expected cost is ~0.24–0.47 MON. 2 MON covers a 5× fee spike with room for a
> retry, and avoids a failed deployment from an underfunded account.

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
> This was validated end-to-end against a real deployment during rehearsal.

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

Only **after** a successful, verified deployment. Do not point the frontend at a
guessed or predicted address.

```bash
# app/.env.local
NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
NEXT_PUBLIC_MONAD_FALLBACK_RPC_URL=https://rpc3.monad.xyz
NEXT_PUBLIC_ONE_REGISTRY_ADDRESS=<REGISTRY_ADDRESS>
```

The Phase 1 portfolio does **not** read the registry — it needs no registry
address. These variables are for Verified ONE (Phase 2). Chain, RPC and
Multicall3 values already live in `app/src/lib/chain.ts`.

## 15. Deployment record template

Fill in immediately after broadcast and commit it to this file.

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

Pre-filled with what is already known:

```text
Network:            Monad Mainnet
Chain ID:           143
Deployer:           <pending — keystore not yet created>
Registry address:   <pending broadcast>
Transaction hash:   <pending broadcast>
Block number:       <pending broadcast>
Gas used:           2322525 (measured in rehearsal; confirm from receipt)
MON cost:           <pending — ~0.24 MON at 102 gwei>
Compiler:           solc 0.8.28+commit.7893614a, optimizer 200 runs, evm shanghai
Commit:             <HEAD at broadcast time>
Explorer:           https://monadvision.com/address/<REGISTRY_ADDRESS>
Source verified:    <pending>
Deployment time:    <pending>
```

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
