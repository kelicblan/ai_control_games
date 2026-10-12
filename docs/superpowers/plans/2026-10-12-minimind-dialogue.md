# MiniMind Dialogue Implementation Plan

> Execute in this chat following test-driven-development and verification-before-completion. The user approved the architecture in chat.

**Goal:** Add nonblocking local NPC speech with bounded caching and GitHub-ready source distribution.

**Architecture:** Python stdlib loopback service owns one llama context. TypeScript dialogue director consumes committed simulation state, caches compatible generated lines, and applies them only to a current caption revision. React owns lifecycle and diagnostics.

**Tech Stack:** Python 3.11+, ctypes, bundled Windows Ollama DLLs, Vite, React, TypeScript, Vitest, Playwright.

**Spec:** ../specs/2026-10-12-minimind-dialogue-design.md

## Constraints and review focus

- MLP actions never wait for inference. Existing static/offline game remains playable.
- Exact ABI-pinned DLLs and GGUF stay local, reproducible downloads are documented.
- NPCs do not share conversation KV; memory is explicit and bounded.
- Reject stale responses after pause, restart, injury or action/weather change.
- Reject malformed/long/thinking/duplicate output; failed inference preserves feedback.

## Tasks

- [x] Inspect runtime, policy/engine hooks, persistence, UI, Git origin and existing tests.
- [x] Move MiniMind into repository and validate file/byte totals; ignore large local assets.
- [x] Add failing Python service/cleanup tests and TypeScript director tests.
- [x] Refactor `minimind3/mmchat.py` for reset, Unicode-safe output, random sampling and bounded no-thinking generation; implement `npc_server.py` and validated speech protocol.
- [x] Implement `src/ai/dialogue.ts` with serialized transport, prioritized bounded queue, state-keyed cache/refill, cooldown, errors and lifecycle invalidation.
- [x] Integrate in `useGame.ts`, camp diagnostics and NPC bubble source; preserve saved-game validation and local speech lifecycle.
- [x] Add same-origin dev/preview proxy, Windows launcher, pinned asset setup, README and CI Python tests.
- [x] Run full tests/build, real-model smoke and browser checks; record actual latency and limitations.
- [x] Review diff and tracked sizes; commit/push feature branch to existing GitHub remote if credentials permit.
