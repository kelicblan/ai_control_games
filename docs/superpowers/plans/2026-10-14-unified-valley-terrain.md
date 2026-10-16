# Unified Valley Terrain Implementation Plan

> Execute inline with executing-plans. User approved the unified terrain design with “继续”. Preserve concurrent changes and existing saves. No paid generation or new worktree is needed.

**Goal:** Replace the cloth-like starter terrain, rectangular road overlays and canal-like river with one authored terrain GLB, a shared curved riverbed/water definition, and roads continuing beyond the initially explored region.

**Architecture:** A pure landscape blueprint defines ridge networks, eroded foothills, river bends/width, and curved paths. An adaptive triangular grid (two metres near the village/mountains, eight metres outside) is authoritative for both exported mesh and walking heights. An offline builder exports one GLB with blended ground/road/rock vertex materials. Runtime loads that GLB for the initial 2.3km square while retaining streamed vegetation/water and distant terrain. Existing buildings remain independent and grounded by the same sampling functions.

**Tech Stack:** TypeScript, Three.js GLTFExporter/GLTFLoader, Vitest, existing seeded noise and world navigation.

## Task 1: Geography contract
- [x] Add failing tests for river width/bend variation, a road extending into unknown land, independent mountain ridges, and exact mesh/physics height agreement.
- [x] Create `src/games/camp/world/landscape.ts` for authored geometry and terrain sampling; integrate `definition.ts` and `settlement.ts` without cyclic imports.
- [x] Keep houses, gate, planted tree points, bridge clearances and authoritative NPC positions consistent. Update local position migration for the changed river.

## Task 2: Unified terrain artifact
- [x] Create `src/scene/landscapeModel.ts` and `scripts/build-valley-terrain.ts`; export `public/assets/models/valley/terrain/model.glb` plus a reproducible manifest.
- [x] Embed irregular worn roads in ground material colours. Remove the separate raised road ribbons and regularly repeated shore boulders.
- [x] Integrate one terrain GLB into the renderer with fallback on load failure, fog support, resource disposal, and no duplicate initial ground tiles. Keep water animated and bridges independent.

## Task 3: Verification and delivery
- [x] Check Windows background child launch behavior and avoid Node watch spawning visible terminal children.
- [x] Run targeted geography/render/navigation/migration tests and production build. Record full-suite limits separately.
- [x] Inspect overview, paths, river and mountain slopes in the real browser; save actual screenshots and update validation notes. No promise of pixel-perfect reference reproduction.
