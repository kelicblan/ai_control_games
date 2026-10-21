# Reference sample implementation plan

**Goal:** A separately launchable Unity art sample with existing animated lord, four reference buildings and a walkable riverbank; preserve Camp gameplay and saves.

**Spec:** docs/reference-sample-plan.md, approved sample scope and 240-credit first batch.

**Architecture:** Separate ReferenceSample.unity scene, editor builder and presentation-only CharacterController. Use existing URP pipeline and existing character clips. Preserve paid source GLBs; any clipping creates derived meshes. No world-service or save writes. This is an art/traversal acceptance sample, not verification of TS-authoritative gameplay integration.

**Constraints:** Work only in Unity checkout. Do not modify dirty files from other tasks. No additional paid steps/re-rolls without approval. Keep sources, actual per-task credits and screenshots.

- [x] Generate and inspect four approved assets sequentially; record actual billing (240 credits).
- [x] Add geography tests for buildable ground, river exclusion and riverbank route; observe failure before implementation.
- [x] Add isolated sample scene builder, imported asset fitting, exact mesh colliders and gate opening.
- [x] Add animated character walking, reference overview, four detail views, screenshot capture and automated traversal probe.
- [x] Build sample into a dedicated native/Builds/ReferenceSample output without changing Camp entry points.
- [x] Run actual rendered Player probe; inspect screenshots and report remaining reference differences honestly. Reference visual acceptance remains outstanding.

Acceptance requires ground-supported movement, no capsule overlap on the walking route, an open gate passage and visible valid generated assets. Fixes must not convert screenshots alone into a completed gameplay claim.
