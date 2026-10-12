# Living Weather Implementation Plan

> **For agentic workers:** Use the execution and parallel-delegation workflows with explicit file ownership. Steps use checkbox syntax.

**Goal:** Make random weather visibly affect the camp and real NPC policy, and extend the river across the map.

**Architecture:** The deterministic game engine owns atmosphere, exposure and weather events. Rendering/audio consume that state; a retrained 41-input policy receives the same normalized observation and structured context. UI records actual decision provenance.

**Tech Stack:** Existing TypeScript, React, Three.js, NumPy, Vitest and Playwright dependencies.

**Spec:** `docs/design/living-weather.md`

## Global Constraints

- Keep the current mobile game style, all existing workstations and offline operation.
- Do not force shelter through weather action masks or label scripted actions as MLP output.
- Preserve legacy saves and original historical features.
- Rendering/audio never mutate simulation RNG; pause freezes weather.
- No new remote model, paid API or product dependency is required.

## Review Focus

- Weather re-planning must preserve manual movement and committed supply returns.
- Resume must not replay old thunder or pile up audio loops.
- Legacy decision schemas must remain distinguishable in UI and exports.
- Rain cover must match visible geometry and reachable rest stations.
- Full-length water must share rendering, hazard and navigation geometry.

## Task 1: Simulation and compatibility

**Files:** `src/game/types.ts`, `weather.ts`, `engine.ts`, `persistence.ts`, corresponding tests.

**Interfaces:** Produce the atmosphere, cover exposure, weather snapshot and intervention contracts in the spec. Consume shared terrain cover and policy observation.

- [x] Write and run failing deterministic weather, shelter and transition-policy tests.
- [x] Add shared types and independent seeded weather schedule, NPC wetness, environmental effects and real re-evaluation.
- [x] Preserve the selected action's progress, manual movement and committed returns.
- [x] Add legacy migration and strict weather/decision validation tests, then implement migration.
- [x] Run focused simulation and persistence tests.

## Task 2: Learned weather response

**Files:** `src/game/observation.ts`, `src/ai/*`, `scripts/train_policy.py`, `public/models/*`, policy tests, model card.

**Interfaces:** Consume `getWeatherSnapshot`. Produce 41 finite normalized inputs, structured context, manifest-compatible real weights and teacher parity samples.

- [x] Add tests using matched observations with equal action masks and different weather.
- [x] Update continuous inputs and equivalent Python/TypeScript teacher scoring.
- [x] Train/export actual weights and validate parity, finite logits and contextual weather choices.
- [x] Update model card with measured metrics and imitation-learning limitations.

## Task 3: River and weather rendering

**Files:** `src/game/terrain.ts`, `src/scene/*`, terrain/physics tests.

**Interfaces:** Export exact shared cover; consume atmosphere and wetness. Preserve `deep-creek` as the water hazard identity.

- [x] Run a failing test that detects water near both north and south map edges.
- [x] Extend shared river bounds and matching carve/banks/water; relocate submerged tree.
- [x] Implement batched tree sway, flame/ember drift, rain/wind effects, canvas motion and actual cover.
- [x] Derive thunder visuals from simulation time and respect reduced motion.
- [x] Run terrain/physics tests and inspect rendered evidence with Task 4.

## Task 4: Weather observation, sound and integration

**Files:** `src/components/*`, `src/App.tsx`, styles, audio/hooks, e2e tests, README.

**Interfaces:** Send bounded weather commands; show recorded weather/decision provenance. Feed current atmosphere to already-unlocked local audio.

- [x] Add weather status/control dialog, NPC exposure overview and recorded weather context.
- [x] Add local wind/rain/thunder audio with pause/mute/restart cleanup; verify lifetime behavior.
- [x] Exercise weather changes through UI and verify actual record source and inputs.
- [x] Run full unit suite, build, actual engine evaluations and production E2E.
- [x] Inspect desktop/mobile weather and river screenshots, console and interaction behavior.
- [x] Review whole branch, fix material issues, commit and synchronize with GitHub.
