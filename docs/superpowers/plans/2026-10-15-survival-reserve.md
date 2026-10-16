# Survival Reserve Implementation Plan

> Execute inline using superpowers:executing-plans, with red/green regression tests.

**Goal:** Maintain a population-aware minimum food reserve and make replenishment the primary NPC activity below it.

**Architecture:** A pure camp survival helper computes reserve and staffing demand from real state. Observation, camp arbitration and engine replanning share it. Observation v3 appends three features and training exports matching model assets; old decision records remain readable.

**Tech Stack:** TypeScript, Vitest, NumPy, local f32 MLP.

- [x] Add failing tests in `tests/survival-reserve.test.ts` for population scaling, low-stock priority despite command/protest, sufficient staffing, incapacitated NPCs, closed gate and committed returns.
- [x] Implement `src/games/camp/simulation/survival.ts`; integrate `observation.ts`, `engine.ts`, and `npc/bridge.ts`. Remove the two-worker food ceiling while demand bounds actual assignments. Preserve real harvesting/deposit/meal accounting.
- [x] Extend observation to v3, update policy contract, decision type and persistence validator with legacy v1/v2 support. Add roundtrip regressions.
- [x] Update TypeScript/Python teacher scores, legal masks and generated data with survival coverage. Train with `python scripts/train_policy.py`, update parity and manifest assets together. Verify `tests/policy.test.ts` and affected schema tests.
- [x] Add a bounded fixed-step multi-day evaluation script that reports reserve deficits, gathered/deposited food, meals, deaths and state validity using actual model and rules. Run multiple seeds and difficulties; investigate failures rather than relaxing assertions.
- [x] Run affected tests, full tests and build, record exact coverage and baseline failures in `docs/validation-survival-reserve.md`. Existing saved characters are not reset or revived. A running server must reload model/code to use the change.
