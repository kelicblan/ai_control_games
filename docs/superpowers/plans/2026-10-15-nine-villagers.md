# Nine Villagers Implementation Plan

> For agentic workers: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Nine distinct villagers, preserving existing runtime history and settings.

**Architecture:** Expand the stable identity catalog and existing numeric personality/behavior system. Recognize supported historical rosters explicitly and migrate only missing identities and social edges. Keep the trained task model dimensions and fixed simulation steps unchanged.

**Tech Stack:** TypeScript, React, Three.js, SQLite world service, IndexedDB settings, Vitest.

## Tasks

- [x] Define nine identity/personality profiles, initial bodies, trait-based dialogue and deterministic tests in simulation/constants.ts, personalities.ts, npc/profiles.ts, social.ts and tests/nine-villagers.test.ts.
- [x] Implement explicit five-person save migration and settings-directory expansion; preserve existing values, history and relationships. Add migration/idempotence tests before implementation.
- [x] Extend scene appearance, voices, independent housing/stations, avatars and 1–9 shortcuts. Test finite safe locations and complete mappings.
- [x] Run focused migration/personality/physics/world-channel tests, typecheck and build. Back up SQLite, restart world service and inspect the actual nine-person snapshot and desktop UI.

Independent implementation work may be delegated by file ownership: runtime identity/personality, persistence/settings, and presentation/housing. Root integrates and validates all boundaries. Preserve all unrelated working-tree changes; no automatic commit or reset.
