# Visual system

The current game uses a real Three.js scene and a full-screen mobile HUD. It preserves the original CampMind palette, character portraits and warm forest atmosphere. The earlier `concept.png` and the image-generation prompts in `asset-prompts.md` document the original art direction; screenshots in `docs/screenshots/` show the running implementation. The 3D interaction and collision specification is in [mobile-3d.md](mobile-3d.md).

## Palette and typography

Deep pine surfaces (`#101f19`, `#172a22`), sage borders (`#3b5145`), warm ivory (`#f4f0df`), secondary gray-green (`#a8b7a8`), amber emphasis (`#f3c76a`), leaf energy (`#8fc883`) and muted coral hunger (`#e59772`) carry across the HUD. The clearing uses warm earth, darker pine foliage and golden firelight. Sunlight and ambient light change with simulated time; the rain scene uses actual 3D line geometry.

Chinese controls use locally bundled Noto Sans SC. The title has a Songti/serif stack with the bundled font as its fallback. The 23 unmodified WOFF2 subsets total 677,636 bytes and retain the SIL Open Font License in `public/assets/fonts/LICENSE`. Source: Fontsource's `@fontsource/noto-sans-sc`, weight 400; bold weight may be synthesized. Lucide supplies the line icons. Rounded translucent surfaces, thin borders and amber selection outlines remain consistent across the game and dialogs.

## Mobile composition

The scene occupies the viewport behind the controls. Resources and time sit at the top, with pause and 1× / 2× / 4× controls nearby. Three compact portraits run down the left edge. The five main tasks sit in the bottom thumb area, immediately below the selected companion's name and task status. Sound, help, the journal and camp options remain accessible at the edges. Camera controls expand from a single button.

The camp drawer contains social interactions, food allocation, autonomy, priorities, recall, new-journey settings, save status and offline status. The journal and decision inspector open as dialogs. Dialogs pause the journey and restore its previous running or paused state when closed. There is no page scrolling during play. Portrait and landscape layouts respect safe-area insets and keep the main touch targets at least 44 pixels in both dimensions.

The phone's default camera is closer than the desktop camera. This makes the campfire, tent, backpacks and character silhouettes readable; some distant collection sites can be outside the initial portrait view. The task dock still reaches those actions, and dragging, pinching or the camera controls reveal the wider scene. Camera movement changes the projection used by both the meshes and their HTML labels.

## Three-dimensional scene and characters

Trees, rocks, logs, tent, storage, fire ring, berries, creek edges and companions are modeled geometry. The original generated `camp.png` is retained as an earlier asset and is not the active map background. The generated `characters.png` atlas still supplies the HUD portraits; the moving people in the world are articulated 3D models with matching gold, teal and purple identity accents.

Characters have walking, working, resting and injury poses. Health reactions flash on the body and appear in a nearby caption and damage label. The fire, thorns and water read their position and dimensions from the same authoritative terrain definitions as the movement system. Normal work happens outside solid props. A direct ground command can approach danger; a floating task label chooses its safe working position.

## Verified visual and interaction decisions

| Area | Current implementation | Verification scope |
| --- | --- | --- |
| Forest and clearing | Modeled pine trees, warm paths, rocks, ferns and flowers surround a central camp | Actual WebGL screenshots at 1440 × 900, 390 × 844, 360 × 740 and 844 × 390 |
| HUD | Pine-green resources, circular portraits and a five-task bottom dock | Full viewport with no horizontal or vertical page overflow in the four checked sizes |
| Character identity | Original portraits plus distinct 3D costumes and body shapes | Selected portrait remains 36 × 43 pixels; selection is also available in the left crew rail |
| Ground and label interaction | Drag to orbit; tap a character to select, a label to assign, or ground to move | Canvas and projected labels share drag cancellation; actual picking uses the rendered camera |
| Injury presentation | Body response, source-specific caption and floating damage | Gameplay records remain the authority for health, object identity and timing |
| Rendering lifecycle | Capped pixel ratio, frame throttling, shared geometry and disposable resources | Paused/reduced-motion frames render only after changes; context loss pauses the journey and exposes a retry |

Small flowers use dedicated low-polygon geometry. This reduced the complete constructed scene from about 521,000 to 342,000 mesh triangles while adding the forest-edge trees and ferns. Rendered triangle and draw-call counts include shadow passes and vary with the camera; these construction counts are not a phone performance benchmark.

The exact automated results, screenshots and hardware limits are recorded in [validation.md](../validation.md). Generated concepts describe art direction; they do not stand in for screenshots or gameplay evidence.
