# DriveLog design system — Night Receipt v3 (+ Look packs)

> Visual SSOT. Live tokens: `src/app/ui/tokens.scss`. Product: `PRODUCT.md`.

**Updated:** 2026-10-22 · **Product:** Personal fuel + maintenance PWA (phone-first, EN+AR)

## Design read

Phone-first Operate PWA. **Default look: Night Receipt v3** — a *layered paper room*. Near-black warm canvas (dark) / warm cream room (light); amber single accent promoted to a **gradient identity** (`--gradient-fuel`: light amber → classic fuel → deep amber) on CTAs and active chrome. Surfaces are layered, not flat: canvas → plate (`--elev-1/2/3` + `--panel-glow` top light) → paper slip (`--paper-edge`). Home keeps a glance hero. Themes: system / light / dark / contrast / dusk. Settings **Look** switches chrome packs (`receipt` · `skeuo` · `neu` · `glass` · `spatial` · `neo` · `aurora` · `plasma`) without changing theme text colors.

**Dials:** `DESIGN_VARIANCE: 6` · `MOTION_INTENSITY: 7` · `VISUAL_DENSITY: 6`

**Stack:** Angular 22 + SCSS tokens. No Tailwind / Material / GSAP / Motion npm.

## Theme vs Look

| Axis | Attribute | Owns |
|------|-----------|------|
| Theme | `data-theme` | `--bg`, `--surface`, `--text`, `--muted`, `--paper-text`, `--cta-text`, accents |
| Look | `data-look` | radius, shadows, bevels, blur, borders, fill opacity, mesh — **not** body/label ink |

**Looks:** `receipt` (default) · `skeuo` · `neu` · `glass` · `spatial` · `neo` · `aurora` · `plasma`

Contrast theme + `prefers-reduced-transparency`: opaque fills, `--glass-blur: 0` for glass/spatial/aurora/plasma; v3 adds degrade rules — `--gradient-fuel` collapses to solid `--fuel`, and `--elev-*`/`--panel-glow`/`--paper-edge` become `none`. `plasma` is CSS frost (ocean mesh, translucent plates, pill chrome). It is not the React `@cruxgarden/plasma-ui` package.

## Color (theme-owned)

| Token | Role |
|-------|------|
| `--bg` | Night canvas / warm room |
| `--paper` / `--paper-text` | Receipt slip islands |
| `--surface` | Secondary cards |
| `--fuel` | Classic amber accent (~5% UI) |
| `--fuel-deep` | Deep amber stop for gradients (light theme `#b45309`; dark uses lighter top stop `#f7c45a`) |
| `--gradient-fuel` | 135° amber gradient — CTA fill + active chrome only. Never body text on mesh |
| `--mint` | Success only (`--ok`) |
| `--text` / `--muted` | Body / secondary ink (never overridden by look) |
| `--focus` | Amber focus ring (2px) |

Never: purple mesh as brand, second accent, doodle chrome. Glass/frost chrome allowed only when Look = glass/spatial/plasma.

## Elevation (v3 system)

Tokens live per-theme in `_themes.scss`:

| Token | Layer |
|-------|-------|
| `--elev-1` | Chips, tabs, small controls |
| `--elev-2` | Plates/cards (`--plate-shadow` composes it with `--panel-glow`) |
| `--elev-3` | Overlays, modals, hero surface |
| `--panel-glow` | Inset 1px top light — the "room lamp" on plates |
| `--paper-edge` | Receipt slip lift (soft warm shadow) |
| `--press-inset` | Pressed state (unchanged) |

Consumers use `var(--elev-1..3)`; looks map `--raise-1/2` and `--plate-shadow` onto the ramp. Ink-led looks (`neo`) and the `contrast` theme flatten the ramp to `none`/hard offsets.

## Type

Outfit (self-hosted, 400–700) + Arabic OS fallback. v3 scale: title `1.75rem`, metric `1.5rem`, hero `clamp(2.75rem, 12vw, 3.75rem)`. Tabular nums on meters/economy/cost.

## Layout / Shell / Fill-up

Glance hero + layered stat plates; fill-up paper receipt keeps ticket edges on an elevated well. Fixed bottom nav + safe-area. Update = modal.

## Motion (MOTION_INTENSITY 7)

CSS + View Transitions; `animejs` islands only (charts draw-in, number morph, tank wave, hero stagger). All islands debounced via `ui/motion/motion-policy.ts`. High-frequency UI stays CSS/instant. `prefers-reduced-motion` kills all transitions/animations (see `_layout.scss`).

## Accessibility

56px tap · 2px amber focus · visible labels · RTL logical properties · icon buttons with i18n `aria-label` · gradient CTA keeps `--cta-text: #1a1814` (≥ 4.5:1 at every stop).
