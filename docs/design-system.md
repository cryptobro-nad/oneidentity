# ONE — Design system

The current visual baseline. This is a starting point, not a permanent ceiling.
See "This baseline may evolve" and "Visual ambition" below.

`src/app/globals.css` is authoritative for the exact color, radius, and shadow
values. This document names the tokens and their roles, not their literal
values, so it does not go stale.

## Character
- Premium, product-led, calm, trustworthy, technically credible.
- Homepage may be more expressive and brand-led.
- Portfolio and Verified ONE stay structured and task-focused.
- Public ONE profile should feel shareable and identity-led.
- Watch-only is the primary entry path.

## Theme and color
- Neutral light theme; charcoal dark theme (not forced pure black).
- Tokens live in `src/app/globals.css` (`@theme inline`), themed by
  `prefers-color-scheme`.
- ONE violet is the only brand accent (`--accent`). Filled violet is reserved
  for true primary actions. Selected and verified/active states may use
  restrained violet (edges, dots, tints).
- Semantic warn and success colors are for real states only, never decoration
  and never a second brand accent.

## Surfaces and depth
- Restrained 1px borders (`--line`, `--line-strong`), radii `--radius-md/lg/xl`.
- Subtle depth via the existing tokens (`--depth-hi`, `--depth-lo`,
  `--depth-shadow`, `--depth-shadow-soft`, `--depth-shadow-hover`) and utilities
  `.depth`, `.depth-soft`, `.depth-lift`. Lighter top edge, darker lower edge,
  one soft shadow, optional 1px hover lift (disabled under reduced motion).
- Avoid by default: gloss, perspective tilt, neon, heavy glow, heavy
  glassmorphism, fake screenshots, generic crypto decoration. These are open to
  an approved, reviewed experiment; fake product data and fake trust signals are
  never open (see `product-truth.md`).

## Layout and type
- Spacing should feel intentional, not merely large. Avoid oversized empty
  regions.
- Progress indicators must reflect real state only (see `StepProgress` in
  `architecture.md`).
- Homepage hero headline currently stays flat (no dimensional text effect); the
  final period in "One view." uses ONE violet.

## Reviewing visual work
- Judge with real screenshots, never assumptions.
- Responsive review at 390, 834 and 1440, in both light and dark mode.
- Require zero horizontal overflow and no clipped controls or addresses.
- Compare experiments against the currently deployed production version. Commit
  81afba2 is the initial documented baseline, not a permanent comparison target.

## This baseline may evolve
- Future visual experiments are encouraged, on separate branches.
- Experiments must be compared against the currently deployed production version
  via screenshots and reviewed before merging.
- The decisions above are sensible defaults, not permanent creative
  restrictions. Change them deliberately, with review, not casually.

## Visual ambition
The current production design is coherent and trustworthy, but it is not
considered the final expression of the ONE brand.

Future experiments should be willing to challenge:
- typography
- composition
- product visualization
- brand expression
- surface language
- motion
- the public identity experience

Experiments should aim to make ONE more distinctive and memorable, not merely
add more cards, spacing, shadows, or violet.

Product truth, accessibility, and functional clarity remain non-negotiable. The
visual language is open to meaningful change.

See also: `product-truth.md`, `architecture.md`, `decisions.md`.
