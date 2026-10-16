# Rectangular settlement and hinged gate validation

Date: 2026-10-14

Implemented a slightly irregular rectangular palisade, approximately 310m wide by 306m deep. One ordered boundary supplies rendered wall segments and authoritative collision shapes. Walls follow terrain and terminate inside the gate posts, eliminating the two broad side openings.

The entrance has two inward-opening timber leaves with iron straps, hinges and rings. The map exposes open/close controls. Closed doors block both NPC and lord movement; closing is refused while anyone occupies the doorway or swing area. Gate state is persisted in the world snapshot. Settlement version 4 migrates newly blocked local positions while preserving resources, history and historical contact IDs.

Validation:

- Production build passed: TypeScript, Vite and offline cache generation.
- 190 scoped tests passed across batches: gate, settlement, migration, navigation, persistence, lord movement/runtime, continuous world, unified landscape, home models and real HTTP service.
- The HTTP service test closes the gate through its real command endpoint, restarts its isolated process, confirms the restored closed state, and reopens it through the endpoint.
- A broad parallel run initially hit timing failures under load. Navigation and persistence passed when run with one worker. The service test now waits on actual SQLite progress instead of assuming an arbitrary 1.3-second tick deadline; both HTTP tests passed afterward.
- Actual browser preview verified the rectangular perimeter, sealed gate junctions, both closed and open door poses. No browser error logs were observed.

Screenshots:

- `screenshots/settlement-rectangular-overview.png`
- `screenshots/settlement-gate-closed.png`
- `screenshots/settlement-gate-open.png`

Runtime boundary: the existing game backend listening on port 18081 was started before this change. It was not terminated or replaced. A previous service restart command was rejected by automatic approval review (`blocked by policy`); no workaround was attempted. The live game needs its backend restarted to activate the new command and collision rules. The preview at `http://127.0.0.1:5180/scripts/valley-preview.html` already runs the new scene and command logic locally and supports opening/closing the gate.

No additional paid asset generation was performed. Existing unrelated workspace changes were preserved. The full repository suite was not rerun for this correction.
