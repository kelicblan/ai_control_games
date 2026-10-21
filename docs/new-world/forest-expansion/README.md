# 寨外森林扩展首版

图1用于森林、路网、活动区布局；图2用于缓坡、河床、岩丘与平地关系。参考图保存在 `references/`。

当前正式 Unity 场景：`native/CampMind.Unity/Assets/CampMind/NewWorldGame/Camp.unity`。
独立地形模型：`native/ArtSource/forest-expansion/forest-terrain.glb`；网格、林木、采集点、栖息地源合同：同目录 `forest-expansion.json`。

按南方全区域扩展后的林地向寨前左右两翼展开，林缘采用不规则轮廓与疏密过渡，保留原河道。净新增可行走区域约 8.42 万平方米，为村寨约 4.87 倍。5 块建设预留空地、49 个可采集站位、1531 棵树。主干道沿原木桥向外延伸，新增两翼环线，支路连通疏林、深林、溪岸与空地。鹿群靠草甸，野猪栖息于较深林地并可到溪岸饮水。溪流较深处禁止直接通行，路线交会处为可通过的浅滩。

地形在本地确定性生成并输出 GLB，没有提交付费生成任务。模型与网格保持可编辑；树石复用项目已有资源，树木保留近景原模型与较低面数远景 LOD。

采集、动物生命和资源消耗仍由世界服务/SQLite 管理。保留旧存档的原资源地理合同，新增资源通过村寨玩法导入。草药植被使用现有可采食植被表现，不代表新增了制药或陷阱玩法；预留空地尚未建造农田、伐木场、猎人小屋或据点。

验证与画面保存在 `native/Artifacts/forest-expansion/`：

- `panorama.png`、`forest-detail.png`、`terrain-top.png`：Unity 实际渲染。
- `validation.json`：实际碰撞导出与可达面积。
- `authority-validation.json`：58 条路线（含两翼）、7 个饮水点、600 秒鹿/野猪饮水存活。
- `gameplay-validation.json`：隔离存档实际远程采集与重启后消耗保持。
- `save-compatibility.json`：旧存档恢复与原校验和保持。

生成前通过 Unity 执行 `CampMind.Editor.ForestExpansionBuilder.ExportRiverBoundary` 导出原河道边界；生成：`node scripts/unity/generate-forest-expansion.mjs`；通过 `CampMind.Editor.ForestExpansionBuilder.Refine` 接入场景并重采样碰撞。
专项验证：`node --test tests/forest-expansion.test.mjs tests/forest-save-compatibility.test.mjs`、`node scripts/unity/verify-forest-expansion.mjs`、`node scripts/unity/probe-forest-gameplay.mjs`。

本次接入的是 Unity 场景及源代码，未切换正式启动包。完整帧率验收和原村寨河岸的既有视觉问题仍需分别处理。
