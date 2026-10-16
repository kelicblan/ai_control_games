# Village Functional Layout Implementation Plan

> Use superpowers:subagent-driven-development to implement independently owned layout and rendering tasks, then integrate and verify in the current checkout.

**Goal:** Match the approved annotated village map with nine homes, a plaza, training ground, warehouse and weaponsmith.

**Architecture:** Shared village layout constants drive definitions, terrain, navigation, vegetation and scene models. Preserve stable home identities and migrate saved actor targets/positions once.

**Tech Stack:** TypeScript, Three.js GLB, SQLite world service, Vitest, Tripo CLI.

**Spec:** ../specs/2026-10-15-village-functional-layout-design.md

**Delivery:** Implemented and reviewed. Three paid assets installed (60 credits total), terrain rebuilt, version 7 migration deployed after SQLite backup, 224 final targeted tests passed, final build passed, desktop overview and facility screenshots retained. Full-suite green is not claimed: the historical three-day gathered-food assertion remains 44/50, while all five NPCs survive the exact three-day replay. See `docs/validation-village-functional-layout.md`.

**Ruling:** Keep core supply/meal locations at their original coordinates on the plaza's north edge. The new northwest warehouse is a map asset; moving the existing economic depot there lengthened trips and caused starvation, so no AI-weight or survival-threshold change was introduced to compensate.

## Constraints and review focus

- Keep north manor, south gate and wall outline; six homes left and three right.
- Only three approved Tripo generations, v3.1-20260211, 20,000 faces, texture/PBR; estimated 60 credits total. No paid retries.
- Public grounds and routes must remain walkable; building door gaps share physics and visuals.
- Preserve progress and five NPC home bindings; no character creation or revival.
- Update terrain GLB revision and browser cache identity with the road blueprint.
- Check full original meshes, roof/rain handling, clipping, model origin/rotation and actual desktop view.

## Task 1: Asset generation and verification (root)

- [ ] Submit the three exact approved prompts from the spec using Tripo CLI.
- [ ] Await completion, inspect each preview and GLB; retain task IDs, actual billing, and source files.
- [ ] Install verified assets under valley/training-ground, valley/warehouse and valley/weaponsmith.

## Task 2: Shared map and migration (layout worker)

- [ ] Add failing tests for nine home slots, functional zones, walkable routes and versioned idempotent save migration.
- [ ] Implement shared `villageLayout.ts`; update definition.ts, settlement.ts, landscape.ts, state.ts and navigation integration as needed.
- [ ] Preserve stable housing IDs and migrate old positions/targets safely.
- [ ] Run relevant layout, navigation and migration tests.

## Task 3: Rendering (scene worker)

- [ ] Add tests for generated public asset placement and load state.
- [ ] Add `settlementFacilities.ts` and update scenery asset types and integration.
- [ ] Place models using shared zones; keep empty ground walkable and vegetation clear; roofs participate in rain.
- [ ] Add labels, foundations and restrained ground treatment where required, preserving full source assets.
- [ ] Run relevant scene tests.

## Task 4: Integration and verification (root)

- [ ] Regenerate terrain via scripts/build-valley-terrain.ts; update model URL revisions.
- [ ] Run focused regressions and TypeScript/build checks; distinguish unrelated baseline failures.
- [ ] Back up SQLite and restart the world service after migration is verified.
- [ ] Verify in desktop browser, inspect full village overview, facilities, passage and save restore; retain screenshot evidence.
- [ ] Record delivered paths, actual per-task billing, validation and limitations.
