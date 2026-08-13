# DriveLog design system

> **LOGIC:** Check `design-system/pages/[page].md` first. If missing, follow this file.
> Skill search (`ui-ux-pro-max`) suggested Community/Forum + Motion-Driven + purple/green + Caveat/Quicksand.
> Those lose to the constraints below. This file is the mapped source of truth.

**Project:** DriveLog  
**Generated:** 2026-08-13  
**Product:** Personal fuel + maintenance PWA (phone-first, EN+AR)

---

## Chosen pattern and style

| Skill suggestion | DriveLog mapping |
|------------------|------------------|
| Pattern: Community/Forum Landing | **Phone-first utility PWA.** One column, max `32rem`, same UI centered on desktop. Community = EN+AR, warm light default, shared language — not members, posts, or join CTAs. |
| Style: Motion-Driven (parallax, 300–400ms) | **Soft UI Evolution** (subtle depth, WCAG, visible focus) + **Swiss Modernism 2.0** (one accent, math spacing). Motion capped at **120ms** `ease-out`. Fill-up stays a 20-second pump, not a dashboard. |
| Colors: `#7C3AED` / join green | **Night-pump.** Amber `--fuel #E8A317` is fuel and CTA only. |
| Type: Caveat + Quicksand (Google Fonts) | **`system-ui, sans-serif`** + OS Arabic. No font packages, no CDN. |
| Effects: glass, scroll, parallax | **Solid surfaces.** Hairline on cards in light. No glass, no page gradients, no 7-segment. |

**Stack:** Angular 22 + `src/app/ui/tokens.scss`. Do not add Tailwind, Bootstrap, Material, CDK, PrimeNG.

**Viewports to keep in mind:** 375 / 768 / 1280. Layout does not change at desktop — it stays one column, centered.

---

## Color tokens

Live in `src/app/ui/tokens.scss`. Light is the **default** (`DEFAULT_THEME`, `index.html data-theme="light"`).

| Role | Token | Light (default) | Dark | Contrast | Dusk |
|------|-------|-----------------|------|----------|------|
| Page | `--bg` | `#F1E6D0` | `#0B0D10` | `#000000` | `#141820` |
| Card | `--surface` | `#FBF6EA` | `#15181C` | `#121212` | `#1E2430` |
| Input well | `--well` | `#E4D8C2` | `#07080A` | `#000000` | `#10141A` |
| Text | `--text` | `#1C1814` | `#F4F1EA` | `#FFFFFF` | `#EBE6DC` |
| Muted | `--muted` | `#534E45` (≥4.5:1 on cream) | `#9A958A` | `#C8C8C8` | `#8E8A82` |
| Fuel / CTA | `--fuel` | `#E8A317` all themes | | | |
| CTA label | `--cta-text` | `#0B0D10` | | | |
| OK (status only) | `--ok` | `#1A8F5C` | `#3DDC97` | `#5CFFB0` | inherit dark |
| Stop (status only) | `--stop` | `#C44747` | `#F87171` | `#FF6B6B` | inherit dark |
| Hairline | `--hairline` | 12% text on cream | 8% text | 40% white | 10% text |
| Focus ring | `--glow` | mix of `--fuel` | | | |

`--ok` / `--stop` are **status**, not economy traffic lights. Do not color L/100km green/yellow/red.

---

## Type

```css
font-family: system-ui, sans-serif;
```

OS stacks already cover Arabic (`Segoe UI`, `Tahoma`, `Geeza Pro`, `Noto Naskh Arabic`). No Google Fonts.

| Use | Size | Weight |
|-----|------|--------|
| Page title (`h1`) | `1.6rem` | 700 |
| Pump value | `2rem` / active `clamp(2.2rem, 9vw, 3.2rem)` | 600, tabular |
| Hero number (home economy) | `clamp(2rem, 8vw, 3.5rem)` | tabular |
| Body / field | `1rem` | 600 on inputs |
| Numeric field | `1.2rem` | tabular |
| Label | `12px`, `0.08em`, uppercase | muted |
| Nav | `11px` | 600 |

Logical properties only (`margin-inline`, `padding-inline`, `inset-inline`, `border-inline-start`). No hardcoded English in UI.

---

## Spacing, radius, tap

8px-ish scale (Swiss). Existing values, named:

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | `4px` | tight gaps, seg inset |
| `--space-2` | `8px` | icon gap, nav pad |
| `--space-3` | `12px` | row gap, card internals |
| `--space-4` | `16px` | field pad, shell inset |
| `--space-5` | `20px` | stack / card pad (`--card-pad`) |
| `--space-6` | `24px` | section air |
| `--radius` | `16px` | cards, fields, CTA, pump keys |
| `--tap` | `56px` | min hit target (fields, CTA, keys, nav) |
| `--shell` | `32rem` | max width, centered |
| `--motion` | `120ms` | color/border/shadow only |
| `--ease` | `ease-out` | enter; reduced-motion kills all |

Do not use scale/translateY on hover (layout shift). CTA/button `:active` may nudge `1px`.

---

## Components

### Field

Native `input` / `textarea` / `select` button in the a11y tree. Class `.input` on `--well`.

- Min height `--tap`, radius `--radius`, pad-inline `--space-4`
- Hover: border toward `--fuel`
- Focus: **2px** `outline` `--fuel`, offset 2px, plus `--glow` (contrast theme: 3px)
- Invalid: border `--stop`
- `inputmode` matches data (decimal on liters/cost/odo)
- Date: existing calendar field — keep native control in the tree

### Card

`.card` / `.due-card` — `--surface`, `--card-pad`, `--radius`, `--hairline`.

- **Not** clickable by default. Do not put `cursor: pointer` on every card.
- Clickable cards (fill-up `.history`, settings `.theme-card`): `cursor: pointer`, hover = color/border/shadow, no scale.
- Due: `border-inline-start` 3px `--stop` overdue, `--muted` soon. Status text, not color alone.

### Nav

4 tabs (Home, Fill-up, Maintenance, Settings). Sticky bottom, `--surface`, hairline top, `--tap` targets, SVG 22px stroke icons.

- Idle: `--muted`. Active: `--fuel` (not a fifth teal tab).
- `cursor: pointer`. Focus: global 2px amber.

### Pump

Fill-up: three `.well` displays + 3×4 keypad + tank seg + date + sticky save.

- Wells: inset `--well-inset`, active border `--fuel` + glow. Hover border toward fuel.
- Keys: `--tap`, `--radius`, `--surface` on `--well`. Active: 25% fuel mix. No 7-segment.
- Do not restyle into charts, parking, or AI.

### CTA

`.cta` / `app-primary-button` — `--fuel` fill, `--cta-text`, `--tap`, `--radius`, weight 700.

- `cursor: pointer`. Hover: glow, not lift. Disabled: opacity 0.4.
- One primary per screen. Home “log fill-up” is the conversion CTA.

---

## Interaction and a11y

- Clickable: `cursor: pointer` (buttons already; links, `.cta`, `.history`, `.theme-card`, nav).
- Hover: color / border / shadow, **120ms**, no layout shift.
- Focus: 2px amber, 2px offset. Never `outline: none` without a replacement.
- `prefers-reduced-motion: reduce` → no transition/animation.
- Icons: inline SVG only. No emoji icons, no new icon library.
- Forms: labels, `aria-invalid`, errors next to fields. Validate on blur/save, not a spinner circus.
- RTL: logical CSS. `dir` from language.

---

## Anti-patterns (do not)

- Copy **Dos Benzin**: teal 5-tab, AI, parking, charts.
- Traffic-light economy (green/yellow/red L/100km).
- Glassmorphism, frosted nav, whole-page gradients.
- 7-segment / calculator chrome on the pump.
- Material / Bootstrap / Tailwind / PrimeNG look.
- Google Fonts, Caveat, Quicksand, Inter packages.
- Skill purple `#7C3AED`, join-green CTA, forum hero / member grid.
- Motion-driven parallax, page transitions, hover scale.
- `cursor: pointer` on static cards.
- Hardcoded English. Physical `left`/`right` when logical exists.
- Slowing fill-up for polish.

---

## Pre-delivery

- [ ] SVG icons, no emoji
- [ ] Pointer cursor only on clickable
- [ ] 120ms hover, no layout shift
- [ ] Light text ≥ 4.5:1; muted ≥ 4.5:1 on `--bg` / `--surface`
- [ ] 2px amber focus
- [ ] `prefers-reduced-motion` honored
- [ ] 375 / 768 / 1280: one column, no horizontal scroll
- [ ] Nav does not cover CTA (sticky save / padding-bottom)
- [ ] Native controls stay in the a11y tree
