# DriveLog product (v2)

Phone-first **Operate** PWA for personal fuel + maintenance. Local-first IndexedDB. EN + AR RTL.

## Visual world

**Driver Ledger** (Dos Benzin–led + Tesla hero): system light/dark, amber `--fuel` (~5% UI), Outfit, money-first hierarchy, sparse Home economy hero. Themes: system / light / dark / contrast / dusk.

## Core flows

| Surface | Behavior |
|---------|----------|
| Shell | Fixed bottom nav (Home, Fill-up, Maintenance, Insights, Settings); update as modal |
| Setup | 2 steps: vehicle → theme/lang/currency (no VIN) |
| Fill-up | Numeric fields + fuel grade chips; cost = liters × unit price |
| Home | Economy hero, one nudge cluster, grade prices only (no “you last paid”) |
| Insights | SVG sparklines, period filters; link to fill-up history |
| Settings | Appearance, vehicle dates, data, reminders (no VIN decode) |

## Intelligence

Visible Home nudges + Insights analytics. Free APIs degrade offline. No chatbot/LLM.

## Stack

Angular 22 standalone · signals · OnPush · SCSS tokens · Vitest · PWA · GitHub Pages.

**Banned:** Tailwind, Material, GSAP, Motion npm, React kits.
