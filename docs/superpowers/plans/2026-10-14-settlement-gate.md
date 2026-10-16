# Settlement wall and gate correction

Requested result: replace the circular palisade with a roughly 300m, slightly irregular rectangular enclosure, seal the junctions to the gate posts, and provide working doors.

- Share one ordered wall polyline between model placement and physical wall segments. Endpoints terminate at the gate posts; do not skip a broad circular arc.
- Follow the existing unified terrain at wall segment endpoints. Retain the original architectural assets and the authored valley terrain.
- Build two solid timber door leaves with opposite hinges, iron straps and handles. Open inward; expose a map button for opening and closing.
- Store gate state in the authoritative world snapshot. Apply the closed collider to both NPC and lord movement. Reject closing while someone occupies the doorway or swing area.
- Advance settlement migration to version 4 and repair only newly blocked local positions. Retain historical collision IDs and save data.
- Verify wall continuity, open/closed passage, NPC and lord collision, occupancy handling, save restoration and real HTTP service persistence. Inspect actual open/closed renders and run the production build.

Scope: settlement boundary, gate rendering/interaction, world movement and backward-compatible persistence. No new generated assets or changes to simulation policy, weather, dialogue or terrain mesh.
