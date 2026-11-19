---
name: drivelog-a11y
description: >
  DriveLog a11y deep reference (essentials always enforced via drivelog-design.mdc).
  Angular 22, EN+AR, RTL, WCAG 2.2 AA — forms, pump keypad, disclosure, themes.
metadata:
  origin: project
  alwaysApply: true
---

# DriveLog Accessibility

Angular-specific a11y deep reference for Cold Night Pump. Essentials are in the always-on `drivelog-design.mdc` rule. For WCAG theory, also see `accessibility`.

## DriveLog targets

| Requirement | Implementation |
|-------------|----------------|
| Tap size | `--tap: 56px` on CTAs and primary controls |
| Focus | 2px `--fuel` outline; 3px in contrast theme |
| Contrast | CTA `--fuel` on `--cta-text`; body on `--bg`/`--surface` |
| Motion | `prefers-reduced-motion` block in `tokens.scss` — do not bypass |
| RTL | Logical properties; test AR layout, not just translated strings |
| Errors | `.err` class + `aria-invalid="true"` on fields |

## Forms (Angular templates)

```html
<div class="field">
  <label class="label" [attr.for]="id">{{ t('field.odometer') }}</label>
  <input
    class="input input--num"
    [id]="id"
    type="text"
    inputmode="decimal"
    [attr.aria-invalid]="error() ? 'true' : null"
    [attr.aria-describedby]="error() ? id + '-err' : null"
  />
  @if (error()) {
    <p class="err" [id]="id + '-err'" role="alert">{{ error() }}</p>
  }
</div>
```

- Every control has a visible `<label>` connected via `for`/`id`
- Icon-only buttons: `aria-label` from i18n (never English-only)
- Use `role="alert"` for validation errors

## Disclosure (progressive disclosure)

Prefer existing `.disclosure` pattern — native `<details>`/`<summary>`:

```html
<details class="disclosure">
  <summary>{{ t('home.vehicleDetails') }}</summary>
  <div class="disclosure__body">
    <!-- secondary content -->
  </div>
</details>
```

Do not replace with custom accordion unless keyboard behavior is fully implemented.

## Pump keypad & custom controls

- Buttons remain `<button type="button">` — never `<div (click)>`
- Disabled CTAs: `:disabled` or `aria-disabled="true"` (matches `.cta` styles)
- Live region for async public data:

```html
<div role="status" aria-live="polite" aria-atomic="true">
  @if (loading()) { {{ t('common.loading') }} }
</div>
```

## RTL (Arabic)

- Set `dir="rtl"` on `html` when language is `ar` (via app shell)
- Use logical CSS: `margin-inline`, `padding-inline`, `border-inline-start`
- Due cards: overdue/soon accent uses `border-inline-start-color` (already in tokens)
- Do not mirror fuel/economy numbers — numerals stay LTR inside `dir="rtl"` when needed (`dir="ltr"` on numeric spans)

## Themes

Four themes: `light` (default), `dark`, `contrast`, `dusk`. Verify focus and CTA contrast in **contrast** theme ( thicker outlines in `tokens.scss`).

## PWA / install strip

- Install prompt buttons need descriptive labels from i18n
- Do not rely on color alone for update-available vs installed states

## Audit checklist

- [ ] Keyboard: Tab order follows visual order in EN and AR
- [ ] All interactive elements reachable without pointer
- [ ] Focus visible on nav, keypad, form fields, disclosures
- [ ] Screen reader: page title + landmarks (`main`, `nav`)
- [ ] Reduced motion: no essential info only in animation
- [ ] Error states announced (`role="alert"`)

## Related

- `drivelog-design` — visual system + stack constraints
- `accessibility` — WCAG 2.2 reference
- `browser-qa` — automated axe + interaction passes
