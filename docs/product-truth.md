# ONE — Product truth

The source of truth for what ONE actually does. Do not document speculative or
future behavior here as if it were current. Values verified at commit 81afba2;
the repository is authoritative if it has since changed.

## Two modes

### Watch-only Portfolio (`/portfolio`)
- Add up to five public Monad wallet addresses (one to five).
- No wallet connection, no signature, no transaction.
- Portfolios are stored locally in the browser only (not onchain, not synced).
- Users can create and name multiple portfolios.
- Shows combined totals and a per-wallet breakdown.
- Assets: MON, stablecoins, supported memecoins, and NFTs (ERC-721).
- Supported-memecoin inclusion is not an endorsement.

### Verified ONE (`/verified`)
- Links 2 to 5 wallets: one primary wallet and one or more secondary wallets.
- Each secondary wallet signs a gasless EIP-712 membership authorization.
- The primary wallet submits one Monad Mainnet transaction to create the ONE.
- The primary wallet does not sign a secondary authorization; it confirms the
  group by submitting the transaction.
- No funds move. No token approvals. ONE never takes custody.
- Creates a public ONE identity address.
- The ONE identity address is an identity address, not a wallet. Users must
  never send funds to it.

## Onchain constants
- Network: Monad Mainnet.
- Chain ID: 143 (hex 0x8f).
- ONERegistry (default): 0xf8E62d8D16acB49eeEeCF13DE48f1f6898c2F915.
  Overridable via `NEXT_PUBLIC_ONE_REGISTRY_ADDRESS`; the default is the live
  deployment. `src/lib/chain.ts` is authoritative.
- Example public ONE identity (live, reference only):
  0x1139dec3A681C96807D8C277601655A707494AaA.
- Wallet limits: minimum 2, maximum 5 members (portfolio mode allows a single
  wallet). See `src/lib/registry/members.ts`.

## Supported assets
- MON (native).
- Stablecoins: USDC, USDT0, AUSD (`src/lib/tokens.ts`).
- Supported memecoins: a curated allowlist. `src/lib/memeTokens.ts` is
  authoritative for the current set; do not freeze the list in docs. Inclusion
  is not an endorsement.
- NFTs: ERC-721 collections, discovered onchain.

## Links
- Live site: https://oneidentity.app
- Repository: https://github.com/cryptobro-nad/oneidentity

## Approved wording and disclaimers
- Use "supported memecoins" (not "all tokens"). Inclusion is not an endorsement.
- "Up to five Monad wallets" (never "every wallet").
- Watch-only: "No wallet connection or signature needed. Nothing is written
  onchain." "Saved only in this browser." "Does not prove that you own the
  wallets."
- Verified ONE: "No funds move, no token approvals, ONE never takes custody."
  "A signature only confirms the wallet agrees to join."
- Profile/identity: "This is an identity address, not a wallet. Do not send
  funds to it."

## Claims the product must never make
- No custody, audited, insured, endorsed, partnered, risk-free, or
  guaranteed-secure claims.
- No fake balances, prices, charts, activity, trust scores, or social proof.
- No verification-by-third-party claim. Verification means the linked wallets
  signed to join, recorded onchain. Nothing more.

## Current verification vs future ideas
Current verification is exactly: secondary wallets sign gasless EIP-712
authorizations, the primary submits one Monad Mainnet transaction, and a public
ONE identity address is created. Any other verification approach is a future
idea and must not be documented or presented as current behavior.

See also: `design-system.md`, `architecture.md`, `decisions.md`.
