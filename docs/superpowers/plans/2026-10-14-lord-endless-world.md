# Lord and Endless World Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the following tasks and review integrated behavior.

**Goal:** Add a persisted player lord, third-person and god cameras, and continuous survival.

**Architecture:** Keep input, authoritative movement, rendering and simulation time separate. Preserve the current dirty working tree; apply focused changes in place because it contains required unpublished world service and settlement work.

**Tech Stack:** TypeScript, React, Three.js, Vitest, SQLite world runtime.

### Task 1: Continuous simulation
- [ ] Add failing tests for crossing 240 seconds, social deadlines and cycling day/night.
- [ ] Add a shared finite cyclic clock; remove end-of-session logic in engine, social, observation, bridge and runtime catch-up.
- [ ] Update persistence for long elapsed time and compatibility, replace countdown and onboarding text.
- [ ] Run scoped simulation and persistence tests; update obsolete finite-journey assertions.

### Task 2: Authoritative player
- [ ] Add failing tests for bounded movement, invalid input, collision and expired controls.
- [ ] Add lord types and pure movement module; persist entity, normalize directional input, expire controls in service runtime.
- [ ] Integrate create/advance/command and save migration, exploration observer.
- [ ] Run player, world service and migration tests.

### Task 3: Cameras and UI
- [ ] Test third-person camera geometry and independent view state.
- [ ] Add perspective camera, player rig, follow position, collision-aware camera distance and separate god orbit.
- [ ] Add button/Tab switching and WASD input with focus, pause, dialog and cleanup handling. Update help.
- [ ] Run build, full unit suite and browser controls/screenshot checks.

### Task 4: Review
- [ ] Review all changed boundaries, fix findings, document validation and remaining limits.

Ruling: retain the current checkout and avoid commits containing unrelated pending changes. Existing working tree is the only complete local game state.

## Execution ledger

- [x] Task 1: continuous clock and survival changes, migration limits, HUD and text. User refined day length to 600s (420 daylight / 180 night); shared clock and tests updated.
- [x] Task 2: separate lord, authoritative movement, validated expiring controls, legacy migration and exploration.
- [x] Task 3: third-person camera, player rig, independent god camera, keyboard/mouse controls and browser screenshots.
- [x] Task 4: integrated review; fix bounded transport, ephemeral renewals, stale revision recovery and editable focus. Build and 47 related tests passed. Full suite executed: 502 pass / 14 geography and settlement-related failures, recorded by name in `docs/validation-lord-endless-world.md`.

Ruling: preserve unrelated geography/settlement implementation and report its regression failures instead of changing active concurrent work.
