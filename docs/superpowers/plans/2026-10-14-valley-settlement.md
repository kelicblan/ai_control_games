# Valley Settlement Implementation Plan

> **For agentic workers:** Execute inline using executing-plans. Preserve the existing uncommitted work in this checkout; do not reset, move, or commit unrelated changes.

**Goal:** Deliver the confirmed 300m Chinese mountain settlement in the playable desktop game.

**Architecture:** Keep geographical definitions authoritative for rendering, navigation and weather. Add a settlement scenery module with batched palisade and vegetation, a modular house renderer with Tripo GLB loading and procedural fallback, and targeted saved-position migration.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite, Tripo CLI.

### Task 1: Authoritative layout and navigation
- [x] Add `tests/valley-settlement.test.ts`: six homes, independent beds, 300m enclosure, gate passage, fence blocking, safe task destinations, smooth manor approach.
- [x] Run `npx vitest run tests/valley-settlement.test.ts`; expect new-layout failures before implementation.
- [x] Update `src/games/camp/world/definition.ts`, add `settlement.ts` for wall/gate geometry; update simulation `terrain.ts` and world `navigation.ts`.
- [x] Keep task resources near original center to preserve survival timing; route each NPC to its own home.

### Task 2: Assets and scenery
- [x] Generate manor, cottage and tower using the recorded Tripo plan; inspect every preview and preserve task IDs/actual costs.
- [x] Add `src/scene/settlementHomes.ts` and `settlementScenery.ts`; share footprints, retain roofs/rain surfaces and dispose owned resources.
- [x] Connect `world/environment.ts`; replace legacy creek scenery with continuous sampled river. Update home camera, lighting and terrain detail.

### Task 3: Migration and verification
- [x] Repair newly blocked restored positions/destinations without changing resources/history. Invalidate outdated routes.
- [x] Update tests whose old two-house/river layout assertions are superseded; retain core navigation/roof/collision behavior.
- [x] Run relevant tests, `npm run build`, full suite and browser verification; record scoped failures separately.
- [x] Save screenshot and validation report with actual asset spend and outstanding limitations.

## Review Focus
Check house entry alignment, ground/base height, wall continuity at seams, bridge height and slope, restored NPCs inside new solids, async loading after disposal, rain rays from above the tallest roof, and duplicate river rendering. Existing worktree changes must be retained.
