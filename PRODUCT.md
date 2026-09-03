# DriveLog product (v2)

Phone-first **Operate** PWA for personal fuel + maintenance. Local-first IndexedDB. EN + AR RTL.

## Visual world

**Dos Benzin Ledger** (replaces Kinetic Pulse / Cold Night Pump): system light/dark default, petrol teal surfaces, amber `--cta` single accent (~5% UI), `--mint` for success only, unified `--metric-tint` cards, Outfit, dense card ledger. Themes: system / light / dark / contrast / dusk.

## Core flows

| Surface | Behavior |
|---------|----------|
| Shell | Fixed bottom nav (Home, Fuel, Maintenance, More); update as modal |
| Setup | 2 steps: vehicle → theme/lang/currency (no VIN) |
| Fill-up | Numeric fields + fuel grade chips; cost = liters × unit price |
| Home | Dense metric ledger, dues cluster, grade prices (no sparse hero) |
| Maintenance | Service log + due reminders |
| More | Settings, data, appearance, reminders (no VIN decode) |

## Intelligence

Visible Home nudges + analytics. **BYOK LLM** allowed (user-supplied API key; optional assistant). Free public APIs degrade offline. No earnings/parking features.

## Stack

Angular 22 standalone · signals · OnPush · SCSS tokens · Vitest · PWA · GitHub Pages.

**Banned:** Tailwind, Material, GSAP, Motion npm, React kits.

**Allowed (lazy islands only):** `animejs` for SVG draw, stagger, and debounced number morphs; `three` for fill-up tank gauge and Home ambient backdrop. High-frequency UI stays CSS/instant.
