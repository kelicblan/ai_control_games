# Persistent World Implementation Plan

**Goal:** SQLite saves with snapshot recovery and a world that advances while the browser is closed.

**Architecture:** A separate loopback Node service owns the simulation, policy inference, commands, pause and speed. SQLite transactions retain revisioned snapshots and wall-clock checkpoints. A same-origin Vite proxy connects the browser; a persistent player cookie isolates worlds. Browser dialogue can submit caption-only changes guarded by revision. A running service advances every 100 ms; after service restart elapsed wall time is replayed in fixed steps until the existing 240-second outcome. Explicit pause remains paused.

**Tech Stack:** TypeScript, Node 24 built-in SQLite, existing simulation/MLP, React, Vitest.

## Scope and invariants
- Database under project data directory by default; configurable for packaged user-data storage. Ignore database and logs in Git.
- Atomic snapshots after commands and periodic simulation checkpoints; retain last 20 snapshots per player. Invalid snapshots remain intact and restore falls back to a valid earlier record. Unknown versions are preserved and never silently overwritten.
- Import valid legacy localStorage only when server has no save, without deleting source. No whole-state browser writes during normal play.
- Server revision checks prevent stale tabs, duplicate mutations and late captions overwriting newer progress. Server failures are visible; no misleading local success.
- Browser close does not pause. Explicit user pause persists. Modal pauses are temporary leases released on disconnect/expiry so closing a paused dialog does not freeze the world permanently.
- Offline simulation still uses the existing decision policy and NPC logic; local LLM caption generation requires the open browser and does not control world behavior.

## Tasks
- [ ] Add SQLite snapshot store and authoritative world runtime. Test reopen, invalid-latest fallback, concurrent revision rejection, persisted pause/speed and wall-time catch-up.
- [ ] Add independent HTTP service, bounded same-origin endpoints, persistent cookie identity and Vite proxy/startup integration. Verify commands reach SQLite and GET cannot overwrite saves.
- [ ] Replace browser simulation/autosave with serialized API mutations and polling. Preserve settings/new-game and caption workflows. Surface connection/save errors and load state; migrate legacy save.
- [ ] Test close/reopen, service restart, pause, stale writes and recovery. Run TypeScript/build and existing scoped tests. Document production service requirement and recovery boundary.

## Acceptance gates
1. SQLite file contains multiple validated snapshots and survives process restart.
2. No browser attached: elapsed time and NPC/resources advance, ending normally at win/loss.
3. Explicit pause remains paused; closing a temporary dialog releases its lease.
4. Corrupt latest snapshot recovers an earlier snapshot without deleting evidence.
5. Stale/repeated mutation cannot reset elapsed state or repeat resource spending.
6. Disconnected frontend reports failure and cannot start an unsaved world.

## Review rulings
- State/time/speed/pause commit atomically. Recovery uses the recovered timestamp and creates a revision greater than the damaged head. Backward clocks freeze progression. Replay is fixed 100ms and bounded by the 240s outcome.
- Mutations carry UUIDs and expected command revisions. Idempotency keys commit with snapshots; retries never reapply. Simulation checkpoints do not change command revision.
- One modal lease owner, three-second expiry, renewed by that tab's polls. Explicit pause supersedes leases and survives restart.
- Detached loopback service survives browser/Vite closure, starts automatically in dev/preview and has a direct production command. Power-off time is replayed on service restart.
- Validate snapshots structurally and with SHA-256. Unreadable or unsupported histories block writes; never create replacement saves silently.
- Persistent random HttpOnly cookie identifies a local player. Cookie loss creates a separate player. Legacy import requires an empty slot; preserve its source.
- Use existing checkout because implementation relies on uncommitted settings/model changes. Preserve them, with no blanket staging or commits.
