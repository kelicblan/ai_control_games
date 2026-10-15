# Wilderness Work Implementation Plan

> Execute inline using executing-plans and test-driven-development; final independent review.

**Goal:** Real wilderness gathering, wildlife, hunting and durable recovery.

**Architecture:** A bounded seeded ecology snapshot owns resource patches and animal actors. Camp engine binds existing actions to reserved targets; an explicit hunting command reuses explore without changing trained model dimensions. Shared navigation enforces gate/bridge transit. Three.js displays snapshots only.

**Tech Stack:** TypeScript, Vitest, Three.js, React, existing SQLite world service.

## Constraints and rulings
- Work in the existing checkout: the approved current settlement is largely uncommitted; a fresh worktree would omit the actual game being modified. Preserve all unrelated work. Do not commit the user's pre-existing changes.
- No additional approval gate: user has confirmed the complete design and implementation.
- Bounded first-ring ecology; distant unlimited ecosystem and full reproduction/food-chain simulation are outside this iteration.

## Tasks
1. Add failing `tests/wilderness.test.ts`: resources and animals outside settlement, reachable work slots, genuine harvest and exclusivity, gate blocking, wildlife safety, snapshot integrity and old-save migration. Run `npx vitest run tests/wilderness.test.ts` and confirm failures.
2. Add `world/ecology.ts` (generation, resource selection/harvest, bounded state validation) and `world/wildlife.ts` (fixed-rate deterministic animal update). Integrate `types.ts`, `state.ts`, `engine.ts`, `observation.ts`, `persistence.ts` and `navigation.ts`. Verify targeted simulation and snapshot tests.
3. Add `scene/wilderness.ts`: recognizable plant patches, harvest trees/stumps, animated animal rigs with visibility/culling. Update real work orientation in `characters.ts`, remove misleading legacy work markers, connect `campScene.ts`.
4. Add hunting command, command dock control, task descriptions and discovered-resource map markers. Preserve the eight model actions and strict server command decoding. Test engine/service behavior.
5. Run full Vitest and build; inspect browser and save screenshots in `docs/screenshots`. Review complete change independently, fix important findings and record evidence in `docs/validation-wilderness.md`.

## Progress
- Design confirmed; source exploration complete; implementation pending.
- Review rulings: ordinary exploration harvests real forage (no random resource awards); reservations derive from living active task IDs and release automatically; returning cargo remains committed. Wild work agreements have a 180 s deadline instead of the obsolete 45 s village budget. Low-energy return threshold is 18, new departures require 45 (55 for exploration/hunting).
- Initial tests RED: missing ecology, village resource fabrication, missing hunting command. Core persistence/navigation tests GREEN: 157 passed. Full initial suite: 9 failures; six legacy assumptions about village work budgets/coordinates and three parallel-load timeouts investigated. Update fixtures to actual resources and rerun serially with bounded worker count.
- Tasks 1–4 implemented. Independent review found off-axis bridge selection, stale ecology clocks, and hunting through walls; regression tests now cover all three. Multi-day supply replay found phantom danger accumulation, now tied to actual wildlife. Explicit hunts persist through weather reviews and healthy brave hunters can face their assigned boar.
- Task 5 complete: browser screenshots and SQLite backup verified; final full regression 77 files / 609 tests passed, build passed. Independent review fixes validated. Live service restart auto-policy rejected; source completion and live deployment remain distinct.
