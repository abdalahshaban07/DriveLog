# DriveLog design system

> **LOGIC:** Check `design-system/pages/[page].md` first. If missing, follow this file.
> Visual SSOT: Figma *DriveLog Visual System — Cold Night Pump* + Design Tokens handoff.

**Project:** DriveLog  
**Updated:** 2026-08-20  
**Product:** Personal fuel + maintenance PWA (phone-first, EN+AR)

---

## Design read

Redesign-overhaul of a phone-first fuel/maintenance Angular PWA for personal drivers, with a night-station utility language (cool slate neutrals + amber fuel), leaning toward Soft UI Evolution + Swiss rhythm + restrained Aura Gradients — not a React/landing rebuild.

**Dials:** `DESIGN_VARIANCE: 5` · `MOTION_INTENSITY: 5` (home/shell/public-data) · `VISUAL_DENSITY: 7` · forms motion `3`.

**Stack:** Angular 22 + `src/app/ui/tokens.scss`. Do not add Tailwind, Bootstrap, Material, CDK, PrimeNG, Framer, GSAP, or React kits.

**Viewports:** 375 / 768 / 1280. Layout stays one column, max `32rem`, centered.

---

## Color tokens

Live in `src/app/ui/tokens.scss`. Light is the **default**. Amber `--fuel` is the **only** strong accent/CTA.

| Role | Token | Light | Dark | Contrast | Dusk |
|------|-------|-------|------|----------|------|
| Page | `--bg` | `#E8ECF1` | `#0B0D10` | `#000000` | `#141820` |
| Card | `--surface` | `#F5F7FA` | `#15181C` | `#121212` | `#1E2430` |
| Input well | `--well` | `#D7DEE8` | `#07080A` | `#000000` | `#10141A` |
| Text | `--text` | `#12161C` | `#EEF1F5` | `#FFFFFF` | `#E8ECF1` |
| Muted | `--muted` | `#5A6573` | `#9AA3B0` | `#C8C8C8` | `#8E97A6` |
| Fuel / CTA | `--fuel` | `#E8A317` (all themes) | | | |
| CTA label | `--cta-text` | `#0B0D10` | | | |
| OK | `--ok` | `#1A8F5C` | `#3DDC97` | `#5CFFB0` | `#3DDC97` |
| Stop | `--stop` | `#C44747` | `#F87171` | `#FF6B6B` | `#F87171` |
| Aura | `--aura-1` | `#C5D0E0` | `#1A2230` | `#1A1A1A` | `#1C2433` |

Atmosphere: layered cool radials on `html`/`body` via `--aura-1/2`. Cards, wells, and **nav stay opaque** — no glassmorphism.

Never: cream/beige, brass/gold second accent, purple mesh, neon gradients.

---

## Type

```css
font-family: 'Outfit', system-ui, 'Segoe UI', Tahoma, 'Noto Sans Arabic', 'Geeza Pro', sans-serif;
```

Self-hosted Outfit woff2 under `src/assets/fonts/` (latin + latin-ext, weights 400/500/600/700). Arabic uses OS fallback. Tabular numerals on meters.

| Use | Size | Weight |
|-----|------|--------|
| Hero number | `clamp(2.75rem, 12vw, 3.5rem)` | 700, tabular |
| Page title | `1.6rem` / `26px` | 700 |
| Snapshot metric | `22px` | 600, tabular |
| Body | `16px` | 500 |
| Section label | `12px` | 600 (max ~1 per 3 home sections) |
| Nav | `11px` | 600 |

---

## Spacing, radius, motion

| Token | Value |
|-------|-------|
| `--space-1`…`--space-6` | 4 / 8 / 12 / 16 / 20 / 24px |
| `--radius` | `16px` (pills only for chips/seg/status) |
| `--tap` | `56px` |
| `--shell` | `32rem` |
| `--motion` | `200ms` |
| `--ease` | `cubic-bezier(0.16, 1, 0.3, 1)` |

Motion bands:
- Shell/nav/CTA: hover + `:active` `scale(0.98)`
- Home: hero enter + short section stagger
- Public-data: skeleton shimmer + list reveal
- Fill-up/settings: color/border/shadow only
- `prefers-reduced-motion`: kill non-essential animation

---

## Home hierarchy

Install strip → Hero → Snapshot → Next due → Around you (fuel + nearby) → Vehicle/recalls disclosure.

Hero max 4 text elements: car name, L/100km, short unit/context, one Log fill-up CTA.

---

## Public-data states

Loading: `.skeleton` / `.skeleton--row`. Empty: `.empty-state`. Error: `.error-state` + existing retry. Success: dense rows + `.list-reveal`.

---

## Anti-patterns (do not)

- Cream `#F1E6D0`, brass, purple mesh, glass nav
- Equal-weight receipt-card soup on Home
- Fake map, fill-up charts, 7-segment
- Traffic-light economy colors
- Google Fonts CDN, Inter, serif display
- Infinite loops, scroll hijack, hover layout shift
- Invented i18n copy or new routes/features

---

## Pre-delivery

- [ ] Cool slate light default; amber sole accent
- [ ] Outfit self-hosted; Arabic OS fallback
- [ ] 200ms motion; reduced-motion honored
- [ ] Home: Hero → Snapshot → Due → Around You
- [ ] Public-data L/E/E/S designed
- [ ] 4 themes · EN+AR · 375/768/1280
- [ ] CTA AA contrast; 2px amber focus
