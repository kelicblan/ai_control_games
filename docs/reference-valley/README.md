# 整体地形与主游戏接入 · 第一轮

> **该版本已被用户判定与参考图不符，视觉验收不通过。** 后续初始化区域按最新全景重建，仅复用人物模型；参见[新规划](../superpowers/specs/2026-10-17-reference-initial-region.md)。下文是历史技术验证记录，不能视为参考图还原成果。

日期：2026-10-17。当前在真实Camp主场景与TS权威世界中运行，已不依赖独立ReferenceSample场景。**本轮交付整体地形骨架与主游戏接入；村寨及周边精修仍在进行，不代表原图效果已经达成。**

## 运行

[运行游戏.cmd](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/运行游戏.cmd) 使用新构建的 `native/Builds/Camp-IL2CPP/CampMind.exe`。Tab切换上帝/领主视角，WASD移动或平移，右键旋转，滚轮缩放，Home重置镜头。沿用原生游戏界面和世界服务。

本轮验收使用独立目录 `native/LocalData/reference-valley-v6-20261017-0948`，未覆盖原玩家存档。直接使用正常游戏入口时，原身份与二维位置保留，人物高度按新地形采样；旧档的完整长期流程尚未验收。

## 已落地

- 地形修订6：2304米见方，452929顶点、903168三角面，GLB为34392568字节。
- 村寨台地基准抬升到约12米，领主府保留相对台地约8米高差；补充西侧、东侧近山及前景支脉。
- 建筑、寨门、河道、桥梁和业务ID保留现有逻辑坐标；寨门至桥梁的坡道重新衔接。人物、寻路、Unity地形碰撞继续使用同一地理数据与导出三角网格。
- 领主宅、九座民居、瞭望塔接入前次Tripo生成的三份参考建筑资产。原生导出器记录源文件SHA256，未覆盖public目录中的历史建筑原件。
- 修正新参考模型不应套用旧屋檐局部拉伸的问题，增加先失败后通过的纵向形状回归。
- 地形绑定岩面细节材质。保留现有人物、NPC、仓库、练武场、兵器铺、资源生态、天气和存档链路。
- 本轮没有新增Tripo任务或消费。

寨门目前仍沿用主游戏现有功能模型和权威开合逻辑。独立样板的寨门修补结果没有直接替换主游戏模型，因为它的结构和门洞仍需精修。

## 实际运行证据

| 验收 | 结果 |
|---|---|
| TS专项 | 16个文件、88项通过 |
| Unity EditMode | 68/68通过 |
| 启动/进程生命周期 | Node 5/5通过 |
| Windows构建 | Camp IL2CPP Release成功 |
| 最终真实窗口 | 领主移动13.60游戏单位，释放输入漂移0，8根骨骼有姿态变化 |
| 真实NPC | 被采样NPC移动30.07游戏单位 |
| 生态 | 84处资源、43只动物与权威快照一致 |
| 保存重启 | 同一scope，revision 20继续到42，elapsed 5.6继续到10.9；后续最终验证继续到revision 64、elapsed 16.3 |
| 实景截图 | 来自连接TS权威的Camp场景，1920×1080固定镜头；截图时暂停并切晴天 |

第一轮运行：`native/Artifacts/slice-de7e7a9a-de90-4146-bc36-f3daa98cadaa`。

同档重启：`native/Artifacts/slice-f0230e7d-3380-466d-b990-3ffac6e335cb`。

最终控制验证：`native/Artifacts/slice-2b44f6ab-2bb6-4d04-9a02-f0442fef6d39`。

最终全景截图：`native/Artifacts/slice-8f5128ef-f0db-4af8-ac44-fe7356c5552a`；该次报告authority为typescript、terrainRevision为6、characters为10。这些验证将社交模型设为离线测试模式，不代表真实LLM社交质量验收。

## 总览与近景

![主游戏整体地形](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-valley/screenshots/overview.png)

![领主宅](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-valley/screenshots/manor.png)

![民居](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-valley/screenshots/dwelling.png)

![寨门](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-valley/screenshots/gate.png)

![瞭望塔](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-valley/screenshots/watchtower.png)

![河岸](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-valley/screenshots/riverbank.png)

![真实控制与天气](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-valley/screenshots/gameplay.png)

相机按观察对象设定固定位置，参数见valley-result.json；尚未进行参考图相机标定，不能把这些图片称为像素级同机位对齐。

## 尚未完成

- 地形是第一轮空间骨架。整体峰形、岩壁层理、前景峡谷轮廓、植被密度和参考图仍有明显差距。
- 村寨建筑尺度与房屋入口、木台阶、地基、寨门参考结构需要继续与人物和权威通行边界精修；当前门洞逻辑通过不等于所有视觉台阶都已验证。
- 河水白浪、瀑布落差、云雾、晨光效果、生活道具及外围场景细节尚未完成。
- 未运行全项目TS测试、完整旧档长期流程、长时间生存评估或新的帧率基准。现有负缩放BoxCollider警告仍存在，TS权威控制验证通过不等于所有Unity相机遮挡边界都已验收。

下一轮优先继续村寨尺度、寨门与近岸细节，随后才扩展外围精修。

## 备份与回退边界

备份位置：`native/Artifacts/reference-valley-backup/2026-10-17`。

- v5原地形GLB及manifest、修改前scene-blueprint.json和Camp.unity。
- `world-native`：SQLite一致性备份，10张表、20个有效快照；`world-editor`：9张表、20个有效快照。已验证SQLite完整性与快照校验和。
- 回退需要配套恢复地形源代码、导出资产、蓝图版本和场景后重新构建，不能只替换GLB。没有额外保留上一版EXE副本；原玩家数据库未被此次验收运行写入。
