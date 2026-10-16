# Automatic save loading and remembered map centre

2026-10-14

The initial page now waits for the first authoritative world response. Existing progress attaches automatically without a journey selection or a local model loading gate. Only a confirmed missing world opens the new-journey form. Connection failures keep the loading/reconnection message visible instead of offering to replace progress. A saved paused state remains paused.

The default camera focus is now world (50,55), the settlement centre. The last free-camera centre, zoom, rotation and elevation are stored per world seed in browser preferences. Camera changes are throttled; pagehide and scene disposal flush pending preferences. Corrupt, unsupported or unavailable preference storage falls back to the settlement centre and does not affect the durable game save. Return-to-camp resets the view to (50,55).

Validation:

- 10 scoped unit tests passed: camera memory, camera/building traversal and world client.
- Production build passed.
- Actual browser page opened an existing paused save directly, with no journey dialog. Reload preserved the existing four-minute progress and resources (20 wood, 10 food).
- In the real CampMap preview, moving the camera to (170,55) and reloading restored exactly (170,55). Return-to-camp restored (50,55).
- The actual game page after reload reported zero dialogs, no loading overlay, and focus (50,55). Screenshot: `screenshots/auto-resume-centered.png`. No browser error logs were observed.
- Added an end-to-end regression to `e2e/world.spec.ts`; its standalone Playwright runner was not executed in this turn. The equivalent browser flow above was checked directly.

These changes concern frontend startup and camera preferences. No world reset, backend restart or save replacement was performed.
