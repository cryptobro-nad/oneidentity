# ONE — Architecture (high level)

Keep this high level. The code is the detail; this file is the map. Exact values
(tokens, addresses, limits) live in source and are authoritative there.

## Stack
- Next.js (App Router) with TypeScript, built with Turbopack.
- Tailwind CSS v4 with design tokens defined in `src/app/globals.css`
  (`@theme inline`), themed for light and dark. `globals.css` is authoritative
  for exact colors, radii, and shadow values.
- Tested with Vitest + Testing Library. Deployed on Vercel.

## Routes and page responsibilities (`src/app`)
- `/` (homepage): brand-led entry. Hero with the wallet-to-ONE visual, "Two
  ways to use ONE", and a public lookup. Presentation only.
- `/portfolio`: Watch-only workspace. One cohesive workspace surface for
  portfolio selection, wallet input, wallet list and actions. Reads public
  chain data; no wallet connection.
- `/verified`: Verified ONE creation flow. Non-sticky three-step progress,
  wallet connection, choose wallets, sign, review and create.
- `/one/[address]`: public ONE profile. Identity-led, shareable, read-only view.

## Component organization (`src/components`)
- Shared UI primitives: `ui/Badge`, `ui/Notice`.
- Portfolio-only: `PortfolioSwitcher`, `WalletList`, `SavedPortfolioNotice`,
  `Notices` (UnverifiedNotice).
- Verified-only: `verified/SetupStep`, `verified/SigningStep`,
  `verified/ReviewStep`, `verified/StepProgress`, `verified/ActiveOneCard`.
- Shared across pages (profile-sensitive, see below): `NftCollectionChecker`,
  `NftHoldings`, `PortfolioResult`, `AddressChip`, `verified/WalletConnect`, and
  `ErrorPanel` (exported from `verified/ReviewStep`).

## Product-logic boundaries (`src/lib`)
- `chain.ts`: chain ID, RPC, ONERegistry address, EIP-712 domain.
- `registry/`: ABI, member rules (`members.ts`), draft + signature status
  (`draft.ts`), EIP-712 typed data (`eip712.ts`), create/simulate/verify
  (`create.ts`), gas (`gas.ts`), error decoding (`errors.ts`).
- `wallet/`: provider discovery, connect/disconnect, network switching,
  WalletConnect.
- `tokens.ts` / `memeTokens.ts`: supported token allowlists.
- `portfolios/`: local portfolio store and storage.

## Local browser storage
- `one.portfolios.v2`: named watch-only portfolios (portfolio list + activeId).
- `one.verified.draft.v1`: the in-progress Verified ONE draft.
- `one.wallet.wc.disconnected`: WalletConnect disconnect intent.
- `one.portfolio.addresses.v1`: legacy single-list key (migrated).
- Storage is local only. Balances and NFT results are never persisted.

## Responsibilities
- Wallet provider (`wallet/`): connection, account, network. UI never fabricates
  connection state.
- EIP-712 signing (`registry/eip712.ts` + `SigningStep`): secondary wallets sign
  membership authorizations. The primary does not sign a secondary auth.
- Monad Mainnet transaction (`registry/create.ts` + `VerifiedClient`): the
  primary submits exactly one `createOne` transaction after simulation.
- Presentation vs product logic: components render state; they must not change
  contracts, signing, transactions, gas, storage, or validation. Example:
  `StepProgress` is presentational and derives its display from existing draft
  and signature helpers; it never writes state or changes availability.

## Shared-component safety
Some components are rendered on more than one page and must not be changed
casually. Any edit must be additive and verified on every page that renders them.
- `NftCollectionChecker`, `NftHoldings`, `PortfolioResult`, `AddressChip`,
  `ErrorPanel`: rendered on the public profile as well as elsewhere.
- `verified/WalletConnect`: primarily part of the Verified ONE flow, but the
  public ONE profile also renders it. Treat it as a shared, profile-sensitive
  component. Prefer additive, opt-in props (for example its `elevated` prop,
  which defaults off so the profile output is unchanged) and re-check the
  profile after any change.

## Pipeline
- Checks (run in `app/`): `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run build`. (Test count was 621 at 81afba2; treat the suite, not the
  number, as the gate.)
- Deployment: Vercel. Pushing a branch creates a protected preview; merging to
  `main` triggers the production deployment to https://oneidentity.app. Never
  merge or deploy without approval.

See also: `product-truth.md`, `design-system.md`, `decisions.md`.
