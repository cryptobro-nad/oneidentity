# Integrating ONE

How to use a Verified ONE identity in your own application without opening a
hole in it.

**Live app:** <https://oneidentity.app> ·
**Registry:** [`0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915`](https://monadscan.com/address/0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915) ·
**Chain:** Monad Mainnet (143)

> **Nothing described here ships as a library.** There is no ONE SDK and no
> audited claim contract. The Solidity and TypeScript below are illustrative
> patterns you implement yourself, not code you can import.

---

## 1. The one thing to get right

There are two completely different things you might do with a ONE address, and
they need completely different levels of trust.

| | Public viewing | Authenticated claiming |
|---|---|---|
| **Question** | "What does this identity hold?" | "Is this person that identity?" |
| **Input** | A pasted address | A connected wallet |
| **Trust needed** | None | Cryptographic proof |
| **Safe for** | Profiles, explorers, dashboards, analytics | Claims, mints, allowlists, gates |
| **Example** | `oneidentity.app/one/0x1139…` | Your mint contract |

Public viewing is genuinely safe with a pasted address — everything shown is
public onchain data anyone could read directly. ONE's own profile pages work
exactly this way, with no wallet connection.

**Authenticated claiming is not.** The moment something of value is at stake,
the address must come from a signature, never from an input field.

---

## 2. Why a pasted ONE address proves nothing

A ONE identity address is:

- **Public** — emitted in the `OneCreated` event and readable from the Registry.
- **Shareable** — the app has a "Copy profile link" button, by design.
- **Indexable** — anyone can enumerate every ONE via `totalOnes()` / `oneAt(i)`.

So this is trivially exploitable:

```
❌ BROKEN
User submits: oneAddress = 0x1139…4AaA
App checks:   combinedERC721Balance(collection) >= 5   ✅ passes
App grants:   the claim
```

The attacker never controlled a single wallet in that ONE. They read the address
off a public profile and pasted it. Whoever holds the most NFTs on Monad becomes
everyone's eligibility.

The fix is not to hide the address — it is public by design and hiding it would
defeat the point. The fix is to **derive** the identity from an authenticated
wallet rather than **accept** it from the user.

```
✅ CORRECT
User connects + signs      → you learn `wallet` cryptographically
one = activeOneOf(wallet)  → you derive the identity
```

Now the user cannot name an identity they do not belong to, because they never
supply it.

---

## 3. Onchain flow

The strongest option: `msg.sender` is the authentication, and no signature
handling is needed.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IONERegistry {
    function activeOneOf(address wallet) external view returns (address);
    function isActive(address one) external view returns (bool);
    function primaryOf(address one) external view returns (address);
}

interface IONEIdentity {
    function combinedERC721Balance(address collection) external view returns (uint256);
    function meetsERC721Threshold(address collection, uint256 minimum) external view returns (bool);
}

/// Illustrative pattern. Not audited, not shipped with ONE.
contract ExampleClaim {
    IONERegistry public constant REGISTRY =
        IONERegistry(0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915);

    address public immutable collection;
    uint256 public immutable minimumHeld;

    /// Keyed on the ONE identity, NOT on the wallet. This is what stops five
    /// wallets in one identity from claiming five times.
    mapping(address one => bool) public claimed;

    error NotInAnyOne();
    error OneInactive();
    error AlreadyClaimed();
    error NotEligible();

    constructor(address collection_, uint256 minimumHeld_) {
        collection = collection_;
        minimumHeld = minimumHeld_;
    }

    function claim() external {
        // 1. msg.sender IS the authentication. Nothing is taken from calldata.
        address one = REGISTRY.activeOneOf(msg.sender);
        if (one == address(0)) revert NotInAnyOne();

        // 2. An inactive ONE has only its historical primary left. It must not
        //    carry eligibility, even though it stays permanently queryable.
        if (!REGISTRY.isActive(one)) revert OneInactive();

        // 3. One claim per identity.
        if (claimed[one]) revert AlreadyClaimed();

        // 4. Eligibility is asked of the identity, which aggregates its wallets.
        if (!IONEIdentity(one).meetsERC721Threshold(collection, minimumHeld)) {
            revert NotEligible();
        }

        claimed[one] = true;
        _grant(msg.sender);
    }

    function _grant(address to) internal { /* mint, transfer, allowlist… */ }
}
```

### Note on `activeOneOf`

`activeOneOf` returns the wallet's **current active** ONE, or the zero address.
It is not a historical index: once a ONE deactivates, every wallet — including
the primary — is unbound and `activeOneOf` returns zero for all of them. Treat a
zero result as "not eligible", never as an error.

---

## 4. Offchain flow

When eligibility is decided by a backend (an allowlist snapshot, a signed
voucher, a Discord role), the same rule applies: derive, never accept.

```ts
// 1. FRONTEND — prove wallet control with a signature.
const nonce = await fetch("/api/nonce").then((r) => r.text());
const message = `Sign in to ExampleApp\nNonce: ${nonce}`;
const signature = await walletClient.signMessage({ account, message });
await fetch("/api/claim", {
  method: "POST",
  body: JSON.stringify({ address: account, message, signature }),
});
// NOTE: no ONE address is sent. The client never gets to choose one.
```

```ts
// 2. BACKEND — verify, then derive.
import { verifyMessage, createPublicClient, http } from "viem";

const wallet = body.address;

// a. Verify the signature actually came from that wallet.
const valid = await verifyMessage({
  address: wallet,
  message: body.message,
  signature: body.signature,
});
if (!valid) throw new Error("bad signature");

// b. Consume the nonce so the signature cannot be replayed.
await consumeNonce(body.message);

// c. Derive the identity from the VERIFIED wallet.
const one = await client.readContract({
  address: ONE_REGISTRY_ADDRESS,
  abi: ONE_REGISTRY_ABI,
  functionName: "activeOneOf",
  args: [wallet],
});
if (one === "0x0000000000000000000000000000000000000000") return deny("no ONE");

// d. Require it to be active.
const active = await client.readContract({ /* … */ functionName: "isActive", args: [one] });
if (!active) return deny("inactive ONE");

// e. Check eligibility, then record against the IDENTITY.
const eligible = await client.readContract({
  address: one,
  abi: ONE_IDENTITY_ABI,
  functionName: "meetsERC721Threshold",
  args: [collection, 5n],
});
if (!eligible) return deny("not eligible");

if (await hasClaimed(one)) return deny("already claimed");
await recordClaim(one); // keyed on the ONE, not the wallet
```

Two details that matter:

- **Include a nonce and consume it.** Without one, a captured signature is
  replayable forever.
- **Never accept a ONE address in the request body.** If it is in the payload,
  it can be forged. Deriving it server-side is the entire safeguard.

---

## 5. Who may act for an identity?

Decide deliberately; the contracts support either.

**Any linked wallet** — the usual choice for claims and gates. Every wallet in
the ONE acts on its behalf, which is the point of aggregation.

```solidity
address one = REGISTRY.activeOneOf(msg.sender);
require(one != address(0) && REGISTRY.isActive(one));
```

**Primary only** — for higher-stakes or administrative actions, where you want a
single designated signer rather than any of five.

```solidity
address one = REGISTRY.activeOneOf(msg.sender);
require(one != address(0) && REGISTRY.isActive(one));
require(REGISTRY.primaryOf(one) == msg.sender, "primary only");
```

| | Any linked wallet | Primary only |
|---|---|---|
| Convenience | High — claim from whichever wallet is to hand | Lower |
| Blast radius if a wallet is compromised | Any wallet can act | Only the primary can |
| Good for | Claims, mints, gates, read-style eligibility | Treasury actions, config, delegation |

Remember membership can shrink: a secondary can remove itself and the primary can
remove a secondary. A wallet eligible today may be unbound tomorrow, so re-check
at the moment of action rather than trusting a cached result.

---

## 6. Duplicate-claim prevention

The core reason to key on the identity:

```solidity
mapping(address one => bool) public claimed;   // ✅ one claim per identity
// mapping(address wallet => bool) public claimed;  // ❌ five wallets, five claims
```

A worked example. One person, one ONE, three wallets holding 2 + 1 + 2 NFTs:

| Approach | Result |
|---|---|
| Per wallet, per-wallet eligibility | Fails a "hold 5" gate on all three wallets |
| Per wallet, ONE-aggregated eligibility | Passes — then **claims three times** |
| **Per identity, ONE-aggregated** | Passes, **claims once** ✅ |

The middle row is the dangerous one, because it looks like it works.

### Edge cases worth handling

- **A wallet leaves and joins another ONE.** `claimed[oldOne]` stays set;
  `claimed[newOne]` does not. Whether that is correct depends on your rules —
  decide it explicitly rather than discovering it.
- **A ONE deactivates after claiming.** The record persists, which is usually
  what you want.
- **A wallet in no ONE.** `activeOneOf` returns zero. Decide whether unlinked
  wallets claim individually or are simply ineligible.

---

## 7. Inactive identities

A ONE becomes **permanently inactive** when its last secondary leaves, and
reactivation is impossible.

```solidity
if (!REGISTRY.isActive(one)) revert OneInactive();
```

The contracts already enforce the consequence: `ONEIdentity` reverts
`InactiveIdentity` on every `combined*` call once only the primary remains. An
inactive identity keeps its metadata and history forever — deliberately, since it
is evidence of a past relationship — but it must not confer current eligibility.
Show history; do not grant on it.

---

## 8. Reference

**`ONERegistry`** — [`0xf8E6…F915`](https://monadscan.com/address/0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915)

| Function | Use |
|---|---|
| `activeOneOf(address wallet) → address` | Derive the identity from an authenticated wallet |
| `isActive(address one) → bool` | Require before granting anything |
| `exists(address one) → bool` | True for active *and* inactive identities |
| `primaryOf(address one) → address` | Primary-only authorization |
| `membersOf(address one) → address[]` | Current linked wallets |
| `memberCountOf(address one) → uint256` | How many wallets |

**`ONEIdentity`** — deployed per identity by the Registry

| Function | Use |
|---|---|
| `combinedERC721Balance(address collection) → uint256` | Aggregate NFT count |
| `meetsERC721Threshold(address collection, uint256 min) → bool` | Threshold check |
| `combinedERC20Balance(address token) → uint256` | Aggregate token balance |
| `combinedNativeBalance() → uint256` | Aggregate MON |
| `getMembers() / memberCount() / isActive()` | Membership, read from the Registry |

Every `combined*` function reverts `InactiveIdentity` on an inactive ONE, and
reverts rather than returning a partial total if any underlying call fails.
**Do not treat a revert as a zero balance.**

---

## 9. What ONE does not give you

Stated plainly, because building on a wrong assumption here is expensive.

- **Not proof of unique humanity.** Nothing stops one person creating several
  ONEs from different wallets. ONE links wallets; it does not count people.
- **Not complete Sybil resistance.** It raises the cost of splitting holdings
  across wallets to farm a per-wallet allocation. It does not stop a determined
  Sybil attacker, and must not be your only defence.
- **Not authentication.** Covered above, and worth repeating.
- **Not proof of current control after a compromise.** A Verified ONE is
  evidence of *prior association*. If a wallet is later stolen, the record shows
  the wallets were linked before the incident — it does not prove who controls
  them now, does not recover funds, and does not reverse transactions.
- **Not custody.** Neither contract can move a user's assets. The identity
  address holds nothing and should never receive funds.
- **Not upgradeable.** Deployed directly, with no owner, admin or pause. What is
  deployed is what you integrate against, permanently.
- **Not a completeness guarantee for NFT discovery.** The app's automatic
  discovery is best-effort and can return a labelled partial result. Onchain
  eligibility checks via `ONEIdentity` are exact — use those for anything that
  matters.

---

## 10. Checklist

- [ ] The ONE address is **derived** from an authenticated wallet, never accepted from input
- [ ] Signature verification includes a **nonce**, and the nonce is consumed
- [ ] `activeOneOf` result is checked for the **zero address**
- [ ] `isActive` is required before granting
- [ ] Claims are keyed on **`claimed[oneAddress]`**, not per wallet
- [ ] Eligibility uses `ONEIdentity`, not a cached or client-supplied figure
- [ ] Reverts are **not** treated as zero balances
- [ ] Membership is re-checked at action time, since wallets can leave
- [ ] Your Sybil model does not assume one ONE equals one person

Questions or corrections: <https://github.com/cryptobro-nad/oneidentity/issues>
