# 寨外森林扩展 Implementation Plan

> Execute inline in the current authorized Unity checkout. Preserve unrelated changes and original player saves.

**Goal:** 从原寨门和木桥延伸出新增可用面积不少于村寨两倍的森林，可探索、采集、狩猎，并保留未来建设用地。

**Architecture:** 本地确定性生成连续的三角网格地形，输出独立 GLB 和网格源数据。Unity 复用现有树木、岩石资源并生成碰撞；从实际碰撞导出权威网格。资源和栖息地使用同一份空间合同，世界服务继续拥有玩法状态。

**Tech Stack:** Node.js, glTF 2.0, Unity 6/URP, TypeScript world service, SQLite.

## Accepted visual direction

图1定义总体布局：村寨位于后侧高地；原桥通向森林主干道，分岔串联疏林草地、密林和多块空地。图2定义连续的缓坡、岩丘、浅溪河床和路网。按新增区域至少两倍村寨面积解释原请求。参考图已保存于 `docs/new-world/forest-expansion/references/`。

Ruling: 地形本地建模，现有生成模型作为树石模块；不提交付费 API。单张图片直接生成完整地图难以保证桥头尺度、连续碰撞和可建设平地。

## Tasks

- [x] 1. Generate deterministic terrain, branching routes, stream, five flat clearings and habitat/resource metadata. Keep the existing village and bridge.
  - Files: `scripts/unity/forest-expansion.mjs`, `scripts/unity/generate-forest-expansion.mjs`.
  - Check: new usable area >= 2 * polygon area of village; routes continuously traverse; all future clearings flat; GLB valid binary boundaries.
- [x] 2. Import generated mesh and decorate in an isolated Unity scene before replacing the game scene.
  - Files: `native/CampMind.Unity/Assets/CampMind/Editor/ForestExpansionBuilder.cs`, terrain shader.
  - Back up current scene and runtime export; re-use authored tree/rock assets, avoid resource duplication.
  - Export actual terrain/obstacle collisions, verify reachable bridge-to-clearing paths, capture panorama and ground detail.
- [x] 3. Connect resources and habitat zoning to world authority without resetting saves or changing resource balances.
  - Files: world profile, wilderness sites, village animals; keep old resource IDs/positions stable.
  - Check new-world routes and resource stands; deer in sparse woodland, boar in deeper forest. No animal resurrection.
- [x] 4. Verify relevant navigation/ecology tests, Unity compilation, and inspect screenshots. Report implemented scope and any unverified runtime behavior separately.

## Acceptance

Both cameras keep free 360-degree orbit and panorama. Original bridge reaches the new forest without a height discontinuity. At least five clearings connected by branching paths; visible, reachable harvest stands; clear shallow blue stream with no vertical bank fence. Physical scene and authority export agree. No edits to old checkout or player save reset.

## Execution evidence and rulings

- Generated ground 50,164 m²; exported accessible exterior after deep-water exclusion 48,158.75 m². Comparing every cell to the preserved pre-expansion walk mask gives net new forest walkable land 43,684 m² / village 17,307.77 m² = 2.52395. Five pads, 49 source stands, 936 trees. Old village outline and bridge remain.
- Physical exported grid is 784,771 cells. Lazy reverse-grid routes replace the former 128 m local-only A* for this authored map. 54 complete authority routes and 575 original bridge segments pass.
- Ruling: the legacy four-species ecology retains its 84 canonical sites and original seed geography. New sites enter the formal village authority separately. A real existing seed-17 snapshot initially failed restoration during compatibility testing; source validation was fixed, original payload/checksum were unchanged, and only the introduced quarantine metadata flag was cleared after a verified backup and successful restoration. Added a regression with a changed current walk mask and depleted legacy source.
- Review identified missing deep-forest water, then stale forage coordinates when updating homes. Both fixed: seven accessible creek-shore drinking sites, open animal access trails, versioned home migration, existing patch coordinates updated with depletion/recovery preserved. Deer/boar drank and survived 600 simulated seconds on the actual exported grid; isolated far-forest food gathering and SQLite restart preserve exactly one consumed unit.
- Trees use shared instanced materials and generated reduced meshes: conifer 19,417→6,257 triangles; broadleaf 19,141→8,006. Original high detail retained near camera. No measured FPS claim.
- Existing controls verified with real Input System W events: ongoing action cancelled, authority/rendered positions both moved, no input error. 200 camera checks cover both 360-degree views and panorama, four aspect ratios.
- The current Unity game scene and independent GLB source are delivered. No formal launcher manifest was promoted by this task; the separate existing village package build was preserved. Existing river-bank visual limitations outside the new forest are not declared resolved.

## Southern coverage revision

- User requested that woodland cover the whole southern foreground rather than an isolated rectangle. Expanded to both flanks, with an irregular tapered boundary and two connecting exploration loops. Exported original river triangles prevent the new terrain from covering the existing waterway.
- Unity Refine completed successfully. Source ground is 95,517 m² with 1,531 trees; actual net additional walkable area is 84,246.75 m² (4.86757 village areas). All 58 routes, including four flank targets, and 575 original bridge segments pass.
- All 49 resource IDs and standing positions remain unchanged. Isolated gameplay collected one unit after 845 ticks and preserved depletion on restart. Seven water sites and 600 simulated seconds of deer/boar survival pass. Unity panorama and top view were inspected; the formal launcher package remains unchanged by this task.
