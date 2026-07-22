# ONE — Decisions log

Important decisions already made, with reasons. Dates are approximate where only
the commit date is known.

## Reference commits
- 00fe17a (2026-07-21): hero spacing fix; production baseline before the design
  experiments were merged.
- 625ca46 (2026-07-22): approved homepage experiment state.
- c267130 (2026-07-22): approved internal-pages experiment.
- 81afba2 (2026-07-22): initial documented production design baseline. Compare
  future work against the currently deployed production version, not a frozen
  commit.

## Decisions
- Watch-only is the primary entry path.
  Reason: lowest friction; no connection, signature, or transaction required.
  Date: 2026-07. Commit: baseline through 81afba2.
- Homepage uses the wallet-to-ONE visual.
  Reason: shows the core value (many wallets, one view) honestly, with real HTML
  chips and result and SVG only for connectors. Date: 2026-07-21. Commit: 4f265a7.
- The final period in "One view." uses ONE violet.
  Reason: a small, tasteful brand mark echoing the ONE dot; no copy change.
  Date: 2026-07-22. Commit: 0c151de.
- Product surfaces use restrained depth.
  Reason: premium, tactile feel without gloss or heaviness; via the shared depth
  tokens/utilities. Date: 2026-07-22. Commit: f165b0a.
- Hero headline stays flat, no dimensional text effect.
  Reason: keeps a serious fintech feel; Variant A (cards only) chosen over
  Variant B (headline depth). Date: 2026-07-22. Commit: f165b0a.
  Note: a current default, open to future experiments.
- Homepage and internal-page experiments were merged through the internal-pages
  branch. Reason: the internal-pages branch was cut from the approved homepage
  experiment, so its history already contained the homepage work; merging it
  alone avoided a duplicate homepage merge. Date: 2026-07-22. Commit: 81afba2.
- Portfolio uses one cohesive workspace surface.
  Reason: reads as a workspace, not several stacked cards. Date: 2026-07-22.
  Commit: c267130.
- Verified ONE uses a presentational three-step progress display.
  Reason: orient the user without a wizard, modal, or sticky header.
  Date: 2026-07-22. Commit: c267130.
- StepProgress must never alter product state or validation.
  Reason: it only reflects real draft/signature state via existing helpers;
  it must not write state, change availability, or invent completion.
  Date: 2026-07-22. Commit: c267130.
- The NFT checker stays visible and visually secondary.
  Reason: useful but advanced; quieted with a Portfolio-side wrapper, not by
  editing the shared component. Date: 2026-07-22. Commit: c267130.
- Public-profile shared components require extra caution.
  Reason: `NftCollectionChecker`, `NftHoldings`, `PortfolioResult`,
  `verified/WalletConnect`, `ErrorPanel` render on the profile; changes must be
  additive and profile-verified. Date: 2026-07-22. Commit: c267130.
- Fake trust signals and fake product data are prohibited.
  Reason: honesty and trust are the product. No fake balances, prices, charts,
  activity, partners, badges, or security claims. Date: 2026-07. Ongoing, not an
  experiment.
- Visual experiments happen on separate branches.
  Reason: keep production stable; review through screenshots before merging.
  Date: 2026-07. Ongoing.
- Production merges require tests, build, screenshots, and manual review.
  Reason: protect a live product. Date: 2026-07. Ongoing.
- The current design is a baseline, not a permanent creative ceiling.
  Reason: the look should keep improving through reviewed experiments; today's
  choices are defaults, not restrictions. Date: 2026-07-22. Commit: 81afba2.

See also: `product-truth.md`, `design-system.md`, `architecture.md`.
