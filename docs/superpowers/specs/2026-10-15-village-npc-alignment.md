# Village NPC behavior and dialogue alignment

User requested comprehensive alignment of NPC behavior/dialogue with the changed world, explicitly approving migration of storage/delivery/meals into the new warehouse. Training and forging are still unimplemented and cannot be claimed as executed tasks.

- Bind supply geometry, nine delivery/meal stations, shared stock transactions and scene picking to the actual warehouse center. Recall targets the village plaza, rest uses each existing owned house. Keep IDs stable for old contact histories.
- Add settlement layout migration v8. Retarget saved meal/delivery/recall paths without resetting stocks, progress, personalities, memories or deaths. Clear obsolete currently displayed tent captions, preserve historical records and make migration idempotent.
- Generate fixed speech from actual started action, task target, work/travel/return phase, weather and survival override. Physical survival execution has a truthful public expression even if private protest remains. No phantom resources when a requested task has no target.
- Centralize present-world facts in the camp adapter: village, home, warehouse, gate, actual food status and day period. Include these in dialogue context and fingerprint/cache invalidation. Every configured local/remote dialogue provider receives the same bounded prompt.
- Preserve personality, social refusal, private grievances and deterministic simulation. Filter obsolete tent history out of prompts without deleting saves. Reject generated tents, mandatory fire survival, unsupported smithing/training and contradictions of closed gates or current survival tasks.
- Align task/social/loading/help text. Avoid new economic/combat features. Validate Python/JS MLP parity, real warehouse routes/deposits, migration, 560-character prompt budget, dialogue acceptance/rejection, cache invalidation, three-day open-gate survival and desktop rendering where tool access permits.

Longer warehouse travel also requires population-aware initial stock in new games (at least the calculated reserve), replacing the obsolete 2-6-food three-person start. Existing saves retain their actual stocks without credits. Village safety follows the authoritative wall outline; weather protection still requires an actual roof. These are independent rules, so standing on the plaza does not provide rain cover.

Publication guards apply to urging, rejected movement and social replies as well as routine decisions. They derive physical food/return commitment from current NPC state even when old diagnostic decision history has been pruned. Private strike/refusal intent remains intact. Bounded prompts prioritize gate and food facts before optional time/place/history.

The earlier local world-service restart was rejected by automatic approval with `blocked by policy`; do not retry the rejected restart through a different tool. Live service reload remains a manual handoff. SQLite backup was verified before the attempted restart; no live reset or revival is authorized.
