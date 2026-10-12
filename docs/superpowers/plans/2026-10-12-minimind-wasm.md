# MiniMind3 WASM Implementation Plan

**Goal:** Replace HTTP speech with worker-based local WASM inference and verified persistent model assets.

**Architecture:** A shared browser runtime owns download/cache/loading and serialized wllama calls; dialogue director owns simulation bindings and presentation. Static build assets carry pinned runtime and optional staged model.

**Tech Stack:** TypeScript, wllama 3.8.1 + compat, CacheStorage, Vite, Vitest, Playwright.

- [x] Add failing tests for download integrity, cache reuse/corruption, cancellation ownership, factual prompts and no service requests.
- [x] Add static asset staging, WASM engine and separate verified model cache.
- [x] Replace director transport/probe, loading status and startup lifecycle without blocking game.
- [x] Remove proxy/server launcher dependency; update docs and browser tests.
- [x] Run units/build and actual model browser generation/cache/offline checks; review and record platform limits.
