# Around

Macrostructure: page header → fuel/charge segment → either a location finder or a Google map.

- The map is a keyless Google embed. Fuel and charge each send their own search query, centered on the chosen coordinates.
- Geolocation only after the CTA. A denied fix stays on the finder with an error.
- Area search geocodes a name, then opens the same map. Changing place returns to the finder.
- No station cards. Google draws the pins; this page does not read them back.
