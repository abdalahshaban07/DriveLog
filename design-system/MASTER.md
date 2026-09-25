# DriveLog design system — Night Receipt (+ Look packs)

> Visual SSOT. Live tokens: `src/app/ui/tokens.scss`. Product: `PRODUCT.md`.

**Updated:** 2026-09-13 · **Product:** Personal fuel + maintenance PWA (phone-first, EN+AR)

## Design read

Phone-first Operate PWA. **Default look: Night Receipt** — near-black canvas (dark) / warm paper room (light), amber single accent, paper slips for money. Home = flat glance strip. Settings **Look** switches chrome packs via `html[data-look]` (orthogonal to color `theme`). MOTION via CSS + View Transitions; `animejs` islands only.

**Dials:** `DESIGN_VARIANCE: 5` · `MOTION_INTENSITY: 5` · `VISUAL_DENSITY: 6`

**Stack:** Angular 22 + SCSS tokens. No Tailwind / Material / GSAP / Motion npm.

## Theme vs Look

| Axis | Attribute | Owns |
|------|-----------|------|
| Theme | `data-theme` | `--bg`, `--surface`, `--text`, `--muted`, `--paper-text`, `--cta-text`, accents |
| Look | `data-look` | radius, shadows, bevels, blur, borders, fill opacity, mesh — **not** body/label ink |

**Looks:** `receipt` (default) · `skeuo` · `neu` · `glass` · `spatial` · `neo` · `aurora` · `plasma`

Contrast theme + `prefers-reduced-transparency`: opaque fills, `--glass-blur: 0` for glass/spatial/aurora/plasma. `plasma` is CSS frost (ocean mesh, translucent plates, pill chrome). It is not the React `@cruxgarden/plasma-ui` package.

## Color (theme-owned)

| Token | Role |
|-------|------|
| `--bg` | Night canvas / warm room |
| `--paper` / `--paper-text` | Receipt slip islands |
| `--surface` | Secondary cards |
| `--fuel` / `--cta` | Amber accent (~5% UI) |
| `--mint` | Success only (`--ok`) |
| `--text` / `--muted` | Body / secondary ink (never overridden by look) |
| `--focus` | Amber focus ring (2px) |

Never: purple mesh as brand, second accent, doodle chrome. Glass/frost chrome allowed only when Look = glass/spatial/plasma.

## Type

Outfit (self-hosted) + Arabic OS fallback. Tabular nums on meters/economy/cost.

## Layout / Shell / Fill-up

Sparse glance strip; fill-up paper receipt (or elevated panel under spatial). Fixed bottom nav + safe-area. Update = modal.

## Accessibility

56px tap · 2px amber focus · visible labels · RTL logical properties · icon buttons with i18n `aria-label`.
