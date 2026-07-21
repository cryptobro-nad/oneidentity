# Follow-up: scoped Button primitive migration

Deferred out of the trust-redesign branch to avoid re-touching the just-stabilized
wallet flow before merge. The redesign is already visually consistent (shared
design tokens + near-identical inline class strings), so this is a maintainability
change, not a user-visible one.

Context from the investigation (design/trust-redesign):

- ~33 `<button>` elements + ~6 `<Link>`-as-button CTAs across ~12 files.
- ~23 are "standard" (primary/secondary, centered) and could migrate.
- The rest are links, custom-layout, or micro/text actions that should stay bespoke.
- Inline primaries use ~5 sizes (`px-4 py-2` … `px-6 py-2.5`) and two disabled
  opacities (40/50); a naive swap would shift padding/dimming, so the primitive
  must be extended first.

## Plan

1. **Extend the primitive before migrating** (`components/ui/Button.tsx`, re-added here):
   - Sizes to cover real usage — add at least `lg` (px-5) and an `xl`/pill-free
     large (px-6); keep `sm`/`md`.
   - `fullWidth` prop (or `w-full sm:w-auto` support) for the mobile connect button.
   - `as` / `asChild` polymorphism so navigation CTAs can render as `next/link`
     `<Link>` (anchor) while sharing styles — the primitive currently renders
     `<button>` only.
   - Reconcile disabled dimming (standardize on one opacity, or expose an override).

2. **Migrate only the standard buttons** (~23): the centered primary/secondary
   actions in `OneLookup`, `PortfolioSwitcher` (create/save/cancel), `WalletList`
   (load/add), `PortfolioResult` (show-zero), `NftCollectionChecker`, `SetupStep`,
   `SigningStep` (sign), `ReviewStep` (simulate/create), `WalletConnect`
   (switch/check/connect), `ActiveOneCard`, and the homepage/portfolio CTAs
   (via `asChild` for the `<Link>` ones).

3. **Leave bespoke — do NOT migrate:**
   - Custom-layout buttons: the portfolio row-select (`aria-current`, stacked
     name + wallet count) and the NFT collection toggle (`aria-expanded` /
     `aria-controls`, chevron + name + count).
   - Micro/text actions: Remove, Clear all, Copy/View, the `text-xs` Edit/Delete
     row actions.

4. **Verification (required before merge of the migration):**
   - Before/after screenshots of homepage, portfolio, the full Verified ONE flow
     (setup → signing → review), and the public profile, at 390px / tablet /
     desktop, light and dark — confirm pixel parity.
   - Re-run the wallet-flow regression tests (`src/lib/wallet/*`,
     `components/verified/WalletConnect.test.tsx`) and the full suite; the buttons
     touched include sign/switch/connect/create, which are on the critical path.
   - Confirm `aria-*`, `type="submit"`, `disabled`, and `onClick` survive on every
     migrated button (the primitive must spread `{...props}`).

## Do not

- Do not change wallet, signature, or transaction logic — this is styling only.
- Do not fold custom-layout or micro actions into the primitive; forcing the
  centered `inline-flex justify-center` layout onto them would regress them.
