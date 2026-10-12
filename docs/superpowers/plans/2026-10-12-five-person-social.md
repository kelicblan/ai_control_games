# 五人性格营地升级 Implementation Plan

> **For agentic workers:** Use the shared contracts below and behavior-first tests. Root coordinates independent file owners, performs integration and whole-branch review.

**Goal:** Five distinct NPCs proactively interact with the player through real negotiations, conflicts, promises, memory and MiniMind3 dialogue.
**Architecture:** Keep deterministic simulation, task MLP and MiniMind speech separated. New social state owns episodes, relations, commitments and memory; explicit player choices execute validated effects through engine hooks.
**Tech Stack:** Existing React19/TypeScript/Three.js/Vitest/Playwright/Python stdlib.
**Spec:** docs/superpowers/specs/2026-10-12-five-person-social-design.md

## Global Constraints
- Existing 240-s simulation, optional offline MiniMind fallback, 41-d task policy and asset ABI remain compatible.
- Five identities: azhuang, xiaomi, laozhou, linlan, aye.
- New dialogue must not directly modify resources or accept arbitrary model commands.
- No repeated user confirmation: implementation is explicitly authorized in the conversation.

## Review Focus
1. Double clicking/stale responses/expired threads never double-spend or change another journey.
2. A promise is kept only after real meal/rest completion; ignored problems can self-resolve.
3. Old three-person states migrate without changing historical decisions or generating fictional memories.
4. Hidden/paused/new-journey async dialogue cannot overwrite current interactions; explicit paused conversations may generate text.
5. Five visible avatars and mobile landscape panels must not cover tasks or trap focus.

## Task 1: Roster and core social contracts (root)
Files: game/types.ts, constants.ts, personalities.ts, social-types.ts, social.ts, engine.ts, tests/social.test.ts.
- [x] Add failing tests: five initialized finite NPCs; proactive open thread; reply spends once; promise pending until actual action; cooldown/expiry; known-person memory; task agreement safety.
- [x] Implement five profiles and centralized NPC factory, bounded social state and APIs, engine lifecycle hooks.
- [x] Run focused tests then full suite; record effects/source truthfully.

## Task 2: Migration and task-policy compatibility (migration agent)
Files: game/persistence.ts, observation.ts, focused tests, scripts/evaluate.ts as needed.
- [x] Verify failures for old3 migration/current5 roundtrip/malformed social schema.
- [x] Strictly validate and migrate new contracts; retain count-normalization semantics and historical 36/41-d inputs.
- [x] Run migration/observation tests; evaluate five actual agents without inventing retraining.

## Task 3: MiniMind grounded social dialogue (dialogue agent)
Files: ai/dialogue.ts, minimind3/npc_server.py, associated JS/Python tests.
- [x] Failing tests for five IDs, social facts/persona, matching message writes, stale social-revision rejection, paused direct chat and service fallback.
- [x] Extend bounded protocol, prompt context and foreground queue; keep native serialization.
- [x] Verify test fixtures do not claim real-model inference.

## Task 4: Five-person mobile interface (UI agent)
Files: components/, App.tsx, styles/social.css, scene/characters.ts, vocal/audio maps if required, e2e social tests.
- [x] Add interaction tests for proactive chip, active chat, 3 choices, source/commitment/memory, pause/resume.
- [x] Implement accessible compact UI and distinct new portraits/3D styling.
- [x] Verify desktop plus phone portrait/landscape against actual rendered app.

## Task 5: Integrate, validate, review and publish (root)
Files: useGame.ts integration if needed, README, docs gameplay/validation, export/evaluation paths.
- [x] Run npm test, npm run test:npc, npm run build, representative existing/new e2e, npm run evaluate.
- [x] Fresh independent code review; fix material findings with targeted regressions.
- [ ] Commit and push completed branch; integrate to main under existing session merge authorization using current remote head/CI.
