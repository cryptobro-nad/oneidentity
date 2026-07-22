# ONE — Operating guide for Claude sessions

ONE is a watch-only + Verified-identity app on Monad Mainnet. Live at
https://oneidentity.app. Repo: https://github.com/cryptobro-nad/oneidentity.
(App code lives in `app/`; run the commands below from there.)

## Read first
Before changing anything, read:
- `docs/product-truth.md` — what the product really does (never contradict it).
- `docs/design-system.md` — the current visual baseline and where it can go.
- `docs/architecture.md` — structure, boundaries, shared-component safety.
- `docs/decisions.md` — why things are the way they are.

## Working rules
- Confirm the current branch and the exact task scope before acting.
- Inspect the relevant files before proposing changes. Do not guess.
- For medium or large tasks, present a plan and get approval before coding.
- Preserve product truth.
- Visual work must not change product logic (contracts, ABIs, wallet, signature,
  transaction, gas, storage, token/NFT logic, routes) unless explicitly approved.
- Do the work on a separate feature or experiment branch. Keep production stable.
- Never merge or deploy without explicit approval.

## Always prohibited (not experiments)
- Fake data of any kind: balances, prices, charts, activity, holdings.
- Fake trust or security claims: audited, insured, endorsed, partnered,
  risk-free, guaranteed-secure, verified-by-a-third-party.
- Fake trust signals: fake partners, badges, testimonials, social proof.
- Invented functionality, features, or product states that do not exist.
- Progress or status displays that do not reflect real state.

## Before finishing any change
- Run in `app/`: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run build`. All must pass.
- Do not weaken or delete tests to make a change pass. If copy or behavior
  changed by approval, update the test to the new intent, not to something
  looser.
- For visual work: capture screenshots at 390, 834 and 1440, in light and dark.
  Compare experiments against the currently deployed production version. Check
  zero horizontal overflow and no clipped controls or addresses.

## Copy and style
- Calm, plain, trustworthy. Avoid em or en dashes as sentence punctuation
  (normal hyphens in compounds like watch-only are fine).
- Violet (`--accent`) is the only brand accent; filled violet is for true
  primary actions only.

## Visual defaults vs experiments
Avoid these by default, but they are allowed inside a controlled, approved,
screenshot-reviewed experiment on its own branch: neon, heavy glow, heavy
glassmorphism, generic crypto decoration, and excessive violet. Fake product
mockups are allowed only as clearly-labelled non-shipping exploration, never as
real product UI.

Visual experimentation is encouraged when isolated on its own branch and
reviewed through screenshots against production. The current design is a
baseline, not a permanent restriction (see `docs/design-system.md`). Product
truth, the "always prohibited" list above, and accessibility are not up for
experimentation.
