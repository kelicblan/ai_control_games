# Companions and regional wildlife implementation plan

Approved: nine fixed, visibly distinct companions matching portrait traits; real regional wildlife with more small animals near camp and rare dangerous animals in remote areas. Preserve existing authority and saves.

- [x] Build fixed companion sprite profiles, directional idle/walk frames and stable actor-ID mapping; remove order-dependent tinting.
- [x] Add deterministic terrain-aware regional wildlife groups. Activate bounded regions around living humans using existing animal engine. Archive inactive region individuals in a separate world-scoped table in the authoritative SQLite database; never regenerate visited/depleted groups.
- [x] Project bounded wildlife observations for the inspected map viewport; use stable species-specific sprites and movement animation. Preserve existing hunting IDs and rules.
- [x] Verify deterministic spawn, safe ground, depletion/revisit/restart, bounded activity, identities and native appearance; run focused tests and build Windows player.

No separate client-side gameplay animals. Dormant regions use coarse presentation of authoritative individuals, without distant full combat or reproduction simulation. Existing wildlife, inventory, actor stats and saves stay intact.

## Evidence

- Unity 15/15: `native/Artifacts/tests/bd4e1445b108400293fd6044d8e18862/results.xml`; sprite previews `native/Artifacts/companion-wildlife/companions.png` and `animals.png` inspected.
- Region tests 4/4; ecology/runtime/population/reset regression tests 15/15. Final regression rerun used a 30-second timeout because one default 5-second reset test timed out while Unity and native validation were running concurrently; all assertions passed on rerun.
- Isolated formal database verification: `native/Artifacts/companion-wildlife/authority-1792633999707/result.json`; 98 active animals, 72-82 observed in tested 500m remote viewports; restart preserved exact paused snapshot, both human policy heads and animal MLP loaded with empty errors.
- Original training-engine files restored byte-for-byte; map adaptation lives in `scripts/world/pixel-wildlife.ts`. No edited model reports, skipped provenance checks, or retraining claims.
- World-scoped `pixel_wildlife_regions` is created additively and cleaned by existing world-reset transaction. Dormant records do not enlarge every hot world checkpoint. No user configuration or live save was changed by tests.
- Native screenshots inspected in `native/Artifacts/companion-wildlife/native-1792633632871` (including forest/wetland animals) and final player launched in `native-1792634118932`. Tests used a read-only SQLite backup restored to an isolated directory; only owned validation processes were stopped.
- Verified native build before the subsequent tree visibility repair: `native/Artifacts/pixel-build-20261022-095411-add5b28c/build.json`, 0 errors/warnings, fingerprint matched the default launcher. Tree visibility repair requires a newer build containing these same NPC/wildlife changes.
- Final combined delivery after tree visibility repair: `native/Artifacts/pixel-build-20261022-095733-acfda51f/build.json`, 0 errors/warnings; default launcher fingerprint `bebfbb37e465e8ac2e93a1e5cef748c822a4b30d50e50faccf83af16a538b264`. Actual tree resource GPU visibility check passed with a stationary root.

Boundaries: theoretical unvisited populations are deterministic and materialize on regional activation; inactive individual behavior is coarse roaming, not full distant combat/reproduction. This is not a full 32km performance benchmark or human art acceptance. Existing dead companions are not revived.
