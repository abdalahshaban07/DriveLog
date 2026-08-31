# DriveLog design system — Dos Benzin Ledger

> Visual SSOT. Live tokens: `src/app/ui/tokens.scss`. Product: `PRODUCT.md`.

**Updated:** 2026-08-23 · **Product:** Personal fuel + maintenance PWA (phone-first, EN+AR)

## Design read

Phone-first Operate PWA. **Dos Benzin ledger** world: deep petrol teal surfaces, mint CTAs, pastel metric cards, cool off-white canvas. Dense card grid — no Tesla-sparse Home hero. System light/dark default. Instrument density (VISUAL_DENSITY 8). MOTION 7 via CSS + View Transitions only.

**Dials:** `DESIGN_VARIANCE: 6` · `MOTION_INTENSITY: 7` · `VISUAL_DENSITY: 8`

**Stack:** Angular 22 + SCSS tokens. No Tailwind / Material / GSAP / Motion npm.

## Color

| Token | Role |
|-------|------|
| `--petrol` | Deep teal for dark cards / primary surfaces (`.card--dark`) |
| `--mint` / `--cta` | Mint green for CTAs (~5% UI) |
| `--fuel` | Warm amber for fuel-grade chips only — not primary CTAs |
| `--metric-blue/green/orange` | Pastel metric card backgrounds |
| `--focus` | Mint/teal focus ring (2px) |

Light: cool off-white `--bg` `#f2f5f7`, white `--surface`, soft `--radius` 15px. Dark / dusk / contrast themes retokened with petrol undertones. `data-theme="system"` follows `prefers-color-scheme`.

Never: cream/beige, purple mesh, glass nav, brass second accent, amber-only Driver Ledger.

## Type

Outfit (self-hosted) + Arabic OS fallback. Tabular nums on meters/economy/cost.

## Layout

**Dense cards** — metric tiles, dues, and Home stack in a ledger grid. Petrol hero/summary cards on white canvas. No single floating hero number with empty whitespace.

## Motion (Emil contract)

| Surface | Decision |
|---------|----------|
| Tab nav | Instant |
| Fuel chip | 50–100ms color/border |
| Receipt total | Instant / opacity flash |
| Update modal | 200–300ms fade + scale(0.95→1) |

Tokens: `--motion-fast` 160ms · `--motion-normal` 250ms · `--ease-out` · `--nav-height`.

Hard bans: no `transition: all`, no `scale(0)`, honor `prefers-reduced-motion`.

**Motion libraries (Operate-safe):** `animejs` on occasional surfaces only (sparklines, receipt count-up, chart stagger). `three` only on fill-up tank + Home ambient (~120px, finite reveal). Max one WebGL surface; CSS fallback when reduced motion.

## Shell

4-tab fixed bottom nav: **Home / Fuel / Maintenance / More** (`position: fixed; bottom: 0` + safe-area). Main padding accounts for `--nav-height`. Update = modal (Later / Update now), not top strip.

## Fill-up

No keypad. Fuel grade chips (amber `--fuel`) + read-only receipt preview. Cost computed.

## Accessibility

56px tap · 2px mint/teal focus · visible labels · RTL logical properties · icon buttons with i18n `aria-label`.
