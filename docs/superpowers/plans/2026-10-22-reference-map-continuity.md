# Reference map and continuous zoom implementation plan

Approved scope: follow the supplied region/village composition; map contents stay represented throughout zoom, only text declutters. Existing authority, saves, characters and ecology remain real.

- [x] Store the supplied design and trace canonical mountain masks, river/road centerlines, forest/wetland areas and landmark anchors from its left map panel.
- [x] Use those shapes in authoritative terrain, collision, chunk generation, overview and viewport data. Preserve the local village proportions and safely relocate existing live positions before validation, with launcher backup.
- [x] Replace the flat-color remote view with an illustrated composite generated from terrain plus map props. Keep loaded detailed chunks visible at every zoom; distant props use merged representations. Do not load all 62500 detailed chunks.
- [x] Verify reference anchors, river/road connectivity, no disappearing village across zoom, old-save inventory/identity preservation, native compilation and actual full/mid/near screenshots.

Visual precision and gameplay checks are reported separately. No complete-design or performance claim from tests alone; use design-overlay comparison and native captures.

Candidate evidence: `docs/implementation/2026-10-22-reference-map-continuity.md`. Human visual acceptance remains pending; no 100% reproduction claim.
