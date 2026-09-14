# DriveLog product (v2)

Phone-first **Operate** PWA for personal fuel + maintenance. Local-first IndexedDB. EN + AR RTL.

## Visual world

**Night Receipt** (default Look): near-black / warm-paper dual surfaces, amber `--cta` single accent, ink `--text`, paper slips for fill-up. Home keeps a flat glance strip (not a hero card). Themes: system / light / dark / contrast / dusk. Settings **Look** switches chrome packs (`receipt` · `skeuo` · `neu` · `glass` · `spatial` · `neo` · `aurora`) without changing theme text colors.

## Core flows

| Surface | Behavior |
|---------|----------|
| Shell | Fixed bottom nav (Home, Fuel, Maintenance, More); update as modal |
| Setup | 2 steps: vehicle → theme/lang/currency (no VIN) |
| Fill-up | Numeric fields + fuel grade chips; cost = liters × unit price |
| Home | Glance strip + quick log, spend outlook, recommendations |
| Maintenance | Service log + due reminders |
| More | Settings, data, appearance, reminders (no VIN decode) |

## Intelligence

Visible Home nudges + analytics. **Coach LLM** via app-held Groq key behind a Cloudflare Worker (`workers/coach-proxy`); users never paste a key. Local Egyptian templates when offline / rate-limited. Free public APIs degrade offline. No earnings/parking features.

## Stack

Angular 22 standalone · signals · OnPush · SCSS tokens · Vitest · PWA · GitHub Pages.

**Banned:** Tailwind, Material, GSAP, Motion npm, React kits.

**Allowed (lazy islands only):** `animejs` for SVG draw, stagger, and debounced number morphs. High-frequency UI stays CSS/instant.
