# Map environment motion implementation plan

**Goal:** Approved subtle wind-driven trees and continuously flowing river water in the default 2D map.

**Architecture:** Keep authoritative state, collision and saves unchanged. Read atmosphere windStrength/windAngle from NativeVillageUi. Animate tree vertices above their fixed foot pivot, with position-based phases. Animate water highlights in world coordinates through a chunk water mask; release masks with chunks. Use the existing shared map material, without per-frame texture uploads or per-tree Update components.

**Tech stack:** Unity, URP HLSL, C#.

- [x] Add environment motion helper and focused tests for wind normalization, tree selection and water masks.
- [x] Connect chunk and gameplay trees and ground masks to the shared shader; smooth actual wind changes.
- [x] Add world-space continuous water ripples and root-anchored tree sway.
- [x] Run Unity tests, regenerate the Windows native build, and record verification boundaries.

Visual acceptance: subtle asynchronous crowns, fixed roots, smoothly changing amplitude, persistent directed water motion, fixed banks/bridges and seamless chunk boundaries. Existing concurrent working-tree changes must be preserved.

## Verification evidence

- EditMode: 13/13 passed, `native/Artifacts/tests/db18d7013eb0422d992c026358d70549/results.xml`.
- Windows IL2CPP: success, zero errors/warnings, `native/Artifacts/pixel-build-20261022-091501-6f9a8366/build.json`.
- Default launcher build validated against current source fingerprint `db3c083369e74b568c36a1293815f4ec8f34b1f909517a5d7e32d111b26af542`.
- Native Direct3D11 GPU probe: all checks passed, `native/Artifacts/environment-motion-20261022/explicit-gpu/environment-motion.json`. Water changed 13414 pixels, dry land 0, crown 1002, root row 0; calm tree images identical. Synthetic offscreen surfaces verify the shipped shader behavior, not aesthetic acceptance of the entire map or a performance benchmark.
- Initial hidden-window captures were black because automatic rendering did not populate the targets. Probe uses the existing project's explicit `RenderPipeline.SubmitRenderRequest` pattern; failed captures are retained as diagnostics and are not acceptance evidence.
- The map capture smoke run used an isolated in-memory map database; no live save edits were performed by verification. Existing game windows have not been stopped and require reopening through the normal launcher to use the new build.
