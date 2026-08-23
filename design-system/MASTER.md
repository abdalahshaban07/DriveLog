# DriveLog design system — Driver Ledger

> Visual SSOT. Live tokens: `src/app/ui/tokens.scss`. Product: `PRODUCT.md`.

**Updated:** 2026-08-23 · **World:** Driver Ledger (Dos Benzin–led + Tesla hero)

## Design read

Phone-first Operate PWA for MENA drivers. **Expense utility with one sparse hero** — not equal card soup, not marketing soft UI.

**Dominant (70%):** Dos Benzin — driver ledger, money first, Arabic-first comfort, task density  
**Accent (30%):** Tesla — Home hero only: huge L/100km, cold empty, almost no chrome

**Dials:** `DESIGN_VARIANCE: 5` · `MOTION_INTENSITY: 4` · `VISUAL_DENSITY: 7`

## Hierarchy (non-negotiable)

| Layer | Rules |
|-------|--------|
| Home hero | Borderless. Big number. Car name quiet. One amber CTA. Breathing room. |
| Money | Month spend + cost/km are first-class ledger rows, not equal widgets |
| Secondary | Due / Around you quieter — less border, no competing shadows |
| Fill-up | Task stack; receipt is an **instrument strip** (ink well); total is the emotional center |
| Shell | Opaque fixed nav; active = amber text + thin top tick — no pill chrome |

## Color

Amber `--fuel` `#E8A317` for CTAs and positive feedback only (~5%). Cool slate neutrals. System light/dark both polished.

Never: cream, purple mesh, glass nav, equal card grids, stadium pills on filters, radial “AI” card glows.

## Type

Outfit (self-hosted) + Arabic OS fallback. Tabular nums on meters / economy / cost. Hero large; labels small; few mid sizes.

## Motion

Tab nav: instant. Fuel chip: border/color only. Receipt total: opacity flash. Modal: 200–300ms scale(0.95→1). Honor `prefers-reduced-motion`.

## Radius

`--radius: 12px` (instrument, not soft SaaS). Nested: `calc(var(--radius) - 2px)`.

## Accessibility

56px tap · 2px amber focus · visible labels · RTL logical properties · i18n `aria-label` on icon buttons.
