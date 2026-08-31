# DriveLog design

The canonical visual specification is [`design-system/MASTER.md`](design-system/MASTER.md).
Read it before changing any user-facing interface.

## Direction

Cold Night Pump: a phone-first automotive utility interface with cool slate
surfaces, amber as the only strong accent, self-hosted Outfit typography, and
restrained motion.

**Motion libraries:** `animejs` and `three` are allowed only as lazy-loaded islands
(sparklines, receipt count-up, chart stagger; fill-up tank + Home ambient canvas).
Nav, filters, and grade chips stay CSS/instant. Honor `prefers-reduced-motion` and
dispose WebGL on route leave. See `src/app/ui/motion/motion-policy.ts`.

Use [Hallmark](https://www.usehallmark.com/) as an audit lens only: purposeful
screen macrostructures, biased hierarchy, one restrained accent, and no generic
AI chrome (centered-everything, purple gradients, icon-tile soup, fake metrics).
Do not install Hallmark or any other design package as a runtime dependency.

Do not install or mix in a generic design preset. Preserve the canonical
tokens, four themes, EN/AR support, RTL behavior, accessibility requirements,
and page-specific hierarchy documented in the master specification.
