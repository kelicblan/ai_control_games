# Village NPC Alignment Implementation Plan

**Goal:** Make NPC destinations, physical tasks, fixed speech and generated dialogue describe the actual village.

**Architecture:** Canonical warehouse/plaza coordinates feed terrain, renderer and task stations. A camp-specific world-context adapter grounds speech and all language backends. Layout v8 migrates old runtime destinations; v3 MLP reserve features adapt to the longer warehouse trip.

- [x] Write seven regressions covering real warehouse stations, no deposit at the old point, world-grounded prompts, obsolete history filtering, gate/reserve invalidation, protest/execution consistency and house-based care choices. Confirm all fail before implementation.
- [x] Move storage, crate collision/rendering and nine separated meal/delivery stations to the actual warehouse. Bind recall to plaza and preserve individual homes.
- [x] Add world-context adapter and truthful execution speech; pass current-world facts through the generic optional DTO field without game imports in reusable packages. Update social and UI copy.
- [x] Migrate layout v7 to v8, preserving historical data, with unsupported-version guards advanced consistently.
- [x] Expand reserve training coverage for longer routes and retrain manifest/weights/parity together.
- [x] Review migration idempotence, prompt budgeting, task-phase/source correctness and real navigation.
- [x] Run affected/full tests, final-model multi-day normal/hard replays, build and available desktop QA. Report pending live reload and unrelated failures precisely. Browser QA and live reload were blocked, not claimed complete; see validation report.
