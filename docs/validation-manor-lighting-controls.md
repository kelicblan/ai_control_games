# Manor entrance, map controls and daylight correction

Validated 2026-10-14.

- Replaced isolated thin stair strips and square posts with joined, thick masonry steps, stone cheeks, a level landing reaching the existing manor entrance, a substantial plinth and partly buried perimeter rubble.
- Kept the source building mesh intact. A derived render material hides only the low outer ground apron where the stone foundation replaces it, removing the exposed cutout boundary without deleting structural triangles.
- Added weathered stone grain and varied masonry surfaces. Approach heights remain fitted to the existing authoritative terrain ramp; no terrain asset regeneration or world reset is required.
- Moved the real CampMap view/gate control strip to the upper right, left of the minimap on desktop. Added narrower-screen positioning rules.
- Raised daytime ambient/fill illumination, retained direct sunlight and softened the cloud penalty. Raised night ambient/fill/exposure floors and reduced night fog darkening so roads, riverbanks and buildings remain readable.

Verification: 14 scoped tests passed (lighting, entrance, home lifecycle and settlement traversal). Production build passed. Browser verification used the real CampMap component at the same camera position for noon and night. The desktop controls and minimap did not overlap; no browser error logs were observed. Narrow-screen CSS was implemented but not separately visually verified.

Evidence:

- `screenshots/map-noon-bright.png`
- `screenshots/map-night-readable.png`
- `screenshots/manor-solid-entrance.png`

Local review fixture: `http://127.0.0.1:5180/scripts/map-lighting-preview.html`. Its noon/night switches affect its local fixture state only; it does not change the player's durable world. The corrected source is used by the normal game too. These rendering/UI changes do not require a backend restart.
