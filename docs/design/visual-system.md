# Visual system

Reference: `concept.png`, generated with the built-in Image Gen tool. Production assets: `public/assets/camp.png`, `public/assets/characters.png`; the matching image generation prompts are recorded in `asset-prompts.md`.

## Composition and tokens
Deep pine surfaces (#101f19, #172a22), hairline sage borders (#3b5145), warm ivory (#f4f0df), secondary gray-green (#a8b7a8), amber accent (#f3c76a), leaf energy (#8fc883), muted coral hunger (#e59772). Main map is dominant; an open left rail contains three crew cards and an event journal. Top resource and mission bands, bottom command dock and narrow model status footer follow the reference. No marketing sections.

Typography: locally bundled Noto Sans SC for legible Chinese controls; a Songti/serif stack for title and feature headlines, with the same bundled font as the fallback on systems without Chinese serif fonts. The 23 unmodified WOFF2 subsets total 677,636 bytes and retain the SIL Open Font License in `public/assets/fonts/LICENSE`. Source: Fontsource's `@fontsource/noto-sans-sc` package, weight 400; bold weight may be synthesized. 14px body, 12px secondary, 18px crew names, 26px brand title. Controls have explicit font sizing and generous main touch areas. One line icon family (Lucide) uses 1.7px stroke and selective filled treatment for fire/leaf. Repeated cards share one component. 8/12/16/24px spacing scale; 12px panel radius.

Map assets have no artistic color overlay in daylight. A functional day/night shade represents simulation time and a functional rain layer represents weather. Selection rings, task bars, sparks and rain are code-native indicators/effects. Portraits and sprites use a generated image atlas rather than approximate vector people.

## Screen states
Primary gameplay follows reference. Intro/continue, help, new expedition, outcome and model inspection use the same dark translucent surface, typography and amber buttons. Mobile stacks the roster into a horizontal row above a fixed-aspect map and wraps the task dock into a touch grid. Sidebar activity is collapsible on narrow screens.

## Deliberate functional additions to reference
The concept is a visual reference, not authoritative gameplay data. All sample resource counts/times are replaced by real state. Speed choices are 1×, 2×, 4× per game spec. Primary action labels are 收集木材 / 寻找食物 / 照看篝火 / 休息 / 帮助伙伴; 鼓励 is a separate social interaction. Additional food allocation, urging, priority, recall, new game, model inspection and scenario controls fulfill the requested verification workflow. Model status reports the actual policy and measured state, never decorative AI claims. Intro text explains task-policy scope; no natural language chat is implied.

## Visual verification ledger

Compared the generated reference and actual Chromium screenshots at **1536 × 1024** (desktop) and **390 × 844** (mobile viewport; full-page capture includes the lower controls).

| Reference feature | Implemented result | Deliberate difference / check |
| --- | --- | --- |
| Dominant illustrated forest clearing | Generated camp artwork fills the main play area with matching woods, berries, fire, tents and river | Separate production art has no baked-in controls or characters; all map targets are real buttons |
| Dark pine HUD and amber emphasis | Resource bar, mission band, crew rail, command dock and footer share the palette and border scale | Active controls and keyboard focus use distinct amber outlines |
| Three warm, readable character identities | Consistent generated portrait/body atlas, three color accents and moving named NPCs | Only the selected character speaks at a time to prevent overlapping bubbles |
| Crew cards with energy and hunger | All three cards show live values, current tasks and emotions; selected card has amber outline | Actual game starts with its own resources and state, replacing concept sample data |
| Bottom task controls | Five primary work buttons plus social, food, priority and recall controls | More controls than the concept are required for a complete intervention loop |
| Handcrafted title and Chinese copy | Chinese title and every control render with bundled fonts when system CJK fonts are absent | Sans fallback is intentional when no Chinese serif is installed; no empty glyph boxes in verified screenshots |
| Responsive playable composition | Mobile places three compact cards over the map and a five-column task dock below it | Vertical scrolling preserves visible controls; verified no horizontal overflow at 390 px and no stretched portrait |

Screenshots in `docs/screenshots/` are captures of the running implementation. The concept image is an art-direction reference, not a claim about game behavior.
