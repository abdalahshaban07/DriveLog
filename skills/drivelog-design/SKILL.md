---
name: drivelog-design
description: >
  DriveLog product + visual system (always enforced via drivelog-design.mdc rule).
  Deep reference for UI, styling, i18n, PWA chrome, page hierarchy, and skill routing.
  Cold Night Pump: amber accent, SCSS tokens, Angular 22, EN+AR RTL, banned deps.
metadata:
  origin: project
  alwaysApply: true
---

# DriveLog Design & Stack

Phone-first **Operate** mode PWA — personal fuel + maintenance utility, not a marketing site.

## When to read (deep reference)

Rule `drivelog-design.mdc` already applies every session. Open this skill for page hierarchy, full checklists, or skill routing detail.

## Authority (read in order)

1. `PRODUCT.md` — users, constraints, terminology
2. `design-system/MASTER.md` — visual SSOT (check `design-system/pages/[page].md` first)
3. `DESIGN.md` — pointer to MASTER
4. `src/app/ui/tokens.scss` — live token values

## Stack (do not drift)

| Layer | Choice |
|-------|--------|
| Framework | Angular 22 standalone, signals, OnPush |
| Styles | SCSS + CSS variables in `tokens.scss` |
| Tests | Vitest (`ng test`) |
| PWA | `@angular/service-worker`, `ngsw-config.json` |
| Data | Local-first `src/app/data/db.ts` + domain layer |
| i18n | `src/app/i18n/` — `en` + `ar`, RTL via `html[dir]` |
| Deploy | Static build → GitHub Pages |

### Banned runtime dependencies

Tailwind, Bootstrap, Angular Material, CDK, PrimeNG, Framer, GSAP, React UI kits, Hallmark (audit lens only — never install).

## Cold Night Pump (non-negotiable)

- **One accent:** `--fuel` amber `#E8A317` for CTAs only (~5% of UI)
- **Surfaces:** cool slate neutrals (`--bg`, `--surface`, `--well`); light is default
- **Typography:** self-hosted Outfit; Arabic OS fallback (`Noto Sans Arabic`, `Geeza Pro`)
- **Tap targets:** `--tap` 56px minimum
- **Focus:** 2px amber outline (`:focus-visible`)
- **Motion:** `--motion` 200ms; honor `prefers-reduced-motion`
- **Disclosure:** native `<details class="disclosure">` for secondary info
- **Viewports:** 375 / 768 / 1280; shell widens to `48rem` at 1280

### Never ship

Cream/beige themes, brass second accent, purple mesh, glassmorphism nav, equal-weight card soup, fake metrics/maps, traffic-light economy colors, Google Fonts CDN, Inter, invented i18n keys or routes.

## Page hierarchy cheatsheet

| Page | Above the fold | Disclosure |
|------|----------------|------------|
| Home | Hero (L/100km) → Snapshot → Next due → Around you | Vehicle / recalls |
| Fill-up | Pump keypad + primary fields | Details + recent history |
| Maintenance | Due list + log CTA | Advanced due/cost fields |
| Settings | Grouped sections | Appearance / vehicle / data / notifications |

## Skill routing

| Task | Skill / agent |
|------|----------------|
| Angular code | `angular-developer` |
| UI polish / audit | `impeccable` (`audit`, `polish`, `harden`, `adapt` — not `bolder`/`overdrive`) |
| Token consistency | `design-system` audit mode only |
| Accessibility | `drivelog-a11y` → `accessibility` |
| Motion | `motion-foundations`, `animate` |
| Domain logic TDD | `tdd-workflow` + `*.check.ts` patterns |
| Pre-ship QA | `browser-qa`, `click-path-audit` |
| Code navigation | `codebase-memory-mcp` |
| Product scope | `product-lens` |

## Implementation checklist

Before marking UI work done:

- [ ] Tokens from `tokens.scss` — no raw hex outside token definitions
- [ ] Reused existing UI primitives (`primary-button`, `date-field`, `pump-keypad`, etc.)
- [ ] Copy from `i18n/en.ts` + `ar.ts` — no hardcoded user strings
- [ ] RTL-safe: `margin-inline`, `padding-inline`, `border-inline-start`, logical properties
- [ ] Public-data states: skeleton / empty / error / success classes
- [ ] `ng build` and `ng test` pass
- [ ] Hallmark anti-patterns avoided (see MASTER.md)

## Related

- `drivelog-a11y` — Angular + WCAG deep reference
- `impeccable` — bounded polish passes after implementation
- `.cursor/rules/drivelog-design.mdc` — **alwaysApply: true** (essentials injected every session)
