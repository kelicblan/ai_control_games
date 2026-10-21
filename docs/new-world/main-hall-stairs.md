# 主殿石阶修复（2026-10-17）

> 用户已否定此版本的布局范围。本文保留为历史记录；当前以 [绿色缺口与寨门接地修正](connection-correction.md) 为准。原先伸入主殿平台的新增模型与铺面已停用，主殿原有模型恢复。

本次按新世界总参考图的长石阶、连续石质压边制作独立楼梯，修复正式场景 `Assets/CampMind/NewWorldGame/Camp.unity`。主殿与箭塔的手调朝向保持不变。单图无法确定的进深、高差按当前主殿实际平台接合；不将这次修复表述为全地图已与原图一致。

## 生成来源

- 整理后的楼梯输入：`native/ArtSource/new-world-20261017/stairs/stairs-reference.png`。
- Tripo v3.1，详细几何及贴图，面数上限 40000；用户确认后仅提交一次，无重抽及额外付费处理。
- 任务：`342ec84b-faee-4b0c-a1ec-5d8f03520d5b`；实际消耗 **60 积分**。
- 原件：`native/ArtSource/new-world-20261017/stairs/generated/tripo-out/new-world-main-hall-stairs-342ec84b/model.glb`；35129 三角面，3 张内嵌图，无外部资源。
- SHA256：`3e1059debb35c9aa7a71f0eedfc316d4d38368b6387e6eaab0d5c192df1e301d`。
- 命令、dry-run、任务结果和原始模型完整保留；Unity 使用本地派生网格，未覆盖生成原件。

## 场景处理

旧长阶、旧压边、旧阶脚补片停用；清除局部穿插面并重建连续的地面过渡。新石阶下端、上端与当前主殿前平台接合，另设连续通行碰撞。上端接缝按手调主殿实际倾斜表面处理，不旋转主殿。

正式场景修复前副本位于 `Assets/CampMind/NewWorldGame/StairsRepair/Before-*.unity`；碰撞数据备份位于 `native/Artifacts/main-hall-stairs/authority-before-*.json`。`repair.json` 记录全部原有 Transform 保持不变的检查结果。

## 验证

- `node scripts/prepare-main-hall-stairs.mjs`：验证任务、费用、GLB 完整性、面数、内嵌资源与哈希。
- `node scripts/unity/verify-stair-map.mjs`：直接使用正式地图的权威高度和碰撞数据，检查出生点至阶脚路线、阶脚至上平台中线通行，输出 `map-verification.json`。
- `NewWorldGameProbe` 的 `--stair-probe` 仅在诊断时启用：角色从出生点沿权威路线行走到阶脚，再注入 W 键，经正常 `NativeCampView` 输入链上楼；记录过程高度和截图，不瞬移角色。
- 场景截图：`native/Artifacts/main-hall-stairs/before-close.png`、`after-close.png`、`after-overview.png`。

实机结果以本次运行输出的 `stair-walk.json` 为准；静态路线通过不能替代实机登阶验证。

## 本次交付验证结果

- 最终正式构建：`native/Artifacts/stair-FinalizeAndBuild-b251ba6fc1834bf9939bdcad8a2086e6`，构建成功；最后生成的构建摘要为 0 错误、0 警告。
- 最终实机：`native/Artifacts/slice-d7009c2b-1804-4993-b84d-d72de51ff641`。从正常村寨出生点实际行走至阶脚，再用 W 键连续登阶并穿过上端接合区域，到达主殿前廊；未使用测试出生点或瞬移。
- 键盘段移动 31.79 米，高度上升 9.29 米，终点位于前廊验收点前方 0.92 米、横向偏差 0.016 米；验收通过。
- 指针进入村寨、世界服务连接、10 个既有人物、9 名 NPC 和 SQLite 校验／恢复均通过。此次未将这些检查作为全地图视觉一致性验收。
- 另通过 `tests/new-world-profile.test.ts` 的 3 项模拟测试。
- 上端旧主殿模型重叠的地面在派生网格中局部裁除，裁切限定在地面高度范围，保留上方建筑；接合区域改为实体石阶并延伸通行碰撞至前廊。原始主殿模型、其他场景的共享源网格及全部建筑朝向保留。
- 实机图：该运行目录下 `stairs-bottom.png`、`stairs-middle.png`、`stairs-top.png`；报告为 `stair-walk.json` 和 `new-world-persistence.json`。
