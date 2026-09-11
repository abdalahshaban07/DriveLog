# DriveLog design system — Night Receipt

> Visual SSOT. Live tokens: `src/app/ui/tokens.scss`. Product: `PRODUCT.md`.

**Updated:** 2026-09-11 · **Product:** Personal fuel + maintenance PWA (phone-first, EN+AR)

## Design read

Phone-first Operate PWA. **Night Receipt** world: near-black canvas (dark) / warm paper room (light), amber single accent, paper slips for money surfaces (fill-up). Home = flat glance strip — not a hero card. System light/dark default. MOTION via CSS + View Transitions; `animejs` islands only.

**Dials:** `DESIGN_VARIANCE: 5` · `MOTION_INTENSITY: 5` · `VISUAL_DENSITY: 6`

**Stack:** Angular 22 + SCSS tokens. No Tailwind / Material / GSAP / Motion npm.

## Color

| Token | Role |
|-------|------|
| `--bg` | Night canvas / warm room |
| `--paper` / `--paper-text` | Receipt slip islands (fill-up, Home hero, last fill) |
| `--surface` | Secondary cards on canvas |
| `--fuel` / `--cta` | Amber single accent for CTAs, focus, glow (~5% UI) |
| `--mint` | Success semantics only (`--ok`) |
| `--warn` | Soft amber caution (dues soon) |
| `--petrol` | Ink charcoal (legacy name; dark cards / charts) |
| `--focus` | Amber focus ring (2px, `var(--fuel)`) |

Never: petrol teal brand, purple mesh, glass nav, second accent, doodle/sketch chrome.

## Type

Outfit (self-hosted) + Arabic OS fallback. Tabular nums on meters/economy/cost. Hero size on Home L/100 and receipt total.

## Layout

**Sparse glance** — flat three-metric strip (no hero card). Fill-up console is a paper receipt. Lists stay scannable rows on canvas.

## Motion

| Surface | Decision |
|---------|----------|
| Tab nav | Instant |
| Fuel chip | 50–100ms color/border |
| Receipt total | Morph / opacity flash |
| Update modal | 200–300ms fade + scale(0.95→1) |

Tokens: `--motion-fast` 160ms · `--motion-normal` 250ms · `--ease-out` · `--nav-height`.

Hard bans: no `transition: all`, no `scale(0)`, honor `prefers-reduced-motion`.

## Shell

4-tab fixed bottom nav: **Home / Fuel / Maintenance / More** (`position: fixed; bottom: 0` + safe-area). Main padding accounts for `--nav-height`. Update = modal (Later / Update now), not top strip.

## Fill-up

No keypad. Fuel grade chips (`--fuel`) + paper receipt preview. Cost computed.

## Accessibility

56px tap · 2px amber focus · visible labels · RTL logical properties · icon buttons with i18n `aria-label`.
