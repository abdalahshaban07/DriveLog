# DriveLog design system — Kinetic Pulse

> Visual SSOT. Live tokens: `src/app/ui/tokens.scss`. Product: `PRODUCT.md`.

**Updated:** 2026-08-23 · **Product:** Personal fuel + maintenance PWA (phone-first, EN+AR)

## Design read

Phone-first Operate PWA. Cool slate + amber fuel. System light/dark. Instrument density (VISUAL_DENSITY 7). MOTION 7 via CSS + View Transitions only.

**Dials:** `DESIGN_VARIANCE: 6` · `MOTION_INTENSITY: 7` · `VISUAL_DENSITY: 7`

**Stack:** Angular 22 + SCSS tokens. No Tailwind / Material / GSAP / Motion npm.

## Color

Amber `--fuel` `#E8A317` only strong accent. Light and dark both polished. `data-theme="system"` follows `prefers-color-scheme`.

Never: cream/beige, purple mesh, glass nav, brass second accent.

## Type

Outfit (self-hosted) + Arabic OS fallback. Tabular nums on meters/economy/cost.

## Motion (Emil contract)

| Surface | Decision |
|---------|----------|
| Tab nav | Instant |
| Fuel chip | 50–100ms color/border |
| Receipt total | Instant / opacity flash |
| Update modal | 200–300ms fade + scale(0.95→1) |

Tokens: `--motion-fast` 160ms · `--motion-normal` 250ms · `--ease-out` · `--nav-height`.

Hard bans: no `transition: all`, no `scale(0)`, honor `prefers-reduced-motion`.

## Shell

Fixed bottom nav (`position: fixed; bottom: 0` + safe-area). Main padding accounts for `--nav-height`. Update = modal (Later / Update now), not top strip.

## Fill-up

No keypad. Fuel grade chips + read-only receipt preview. Cost computed.

## Accessibility

56px tap · 2px amber focus · visible labels · RTL logical properties · icon buttons with i18n `aria-label`.
