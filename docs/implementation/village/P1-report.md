# P1 共用玩法、社会协议与 v4 契约报告

实施范围为 T04 → S01 → T05 → S02 → T06 → T07。P0 已由用户于 2026-10-17 回复“接受”。本阶段等待独立验收；后续真实经营与 Life alpha 属 P2。

| 任务 | 实现与证据 |
| --- | --- |
| T04 | 原型与实例分离；P001 玩家不占十人招募名额；人物知识独立；新 schema、规则哈希和严格读档。新世界保存到同一 SQLite 文件的 village_worlds_v1 表，旧世界保持独立。 |
| S01 | 事件参与者／可见名单约束个人知识；报告与观察分开；个人目标、定向关系保留证据引用；社会投影不读取别人目标。 |
| T05 | 共用 ActionCommand／Execution；幂等 operationId、相关 readSet、资源预留、取消释放、完成结算、失能中断；效果异常及负库存回滚。服务和模拟共用 advanceVillage。 |
| S02 | 版本化能力目录、结构化提议、精确条款哈希、各方独立同意；激活计划只产生命令，复用唯一执行器。社会状态读档检查人物、议题、提议、同意、约定及计划引用。 |
| T06 | 保留 32 动作顺序；Life 128+64=192，Tactical 96+64=160；未知 -1／置信度 0；归一化与特征哈希固定；FP32 逐候选推理；拒绝旧格式、错误哈希及规则不兼容。 |
| T07 | 有界场景、统一固定 100ms 推进；逐 executionId 记录前后观察、评分、模型身份及实际命令；accepted／completed 分开，未完成为 truncated；命令与评分记录后可重放。 |

## 运行与验证

新入口仍位于现有 `scripts/world/server.ts` 服务，必须显式设置 `CAMP_VILLAGE_EXPERIMENTAL=1`；默认不激活新模式。协议为 `/game-api/village`，请求需 `X-Camp-Village-Protocol: 1`，复用现有 Cookie、页面标识与同源校验。支持 create、command、pause 和读取；HTTP 只允许玩家身份的 player_input 命令，不允许冒充 NPC 或 active_plan。返回值剔除人物私有知识、目标、关系、性格及非玩家执行事件。

新模式没有 Unity 操作界面。服务入口、重启、幂等与持久化通过隔离数据库和本次拥有的临时服务验证，没有替换用户正在运行的世界服务，也没有修改地图或重建 Unity EXE。

```powershell
npm run check
npm run check:village
npm run check:npc
npx vitest run tests/village/ --maxWorkers=1 --minWorkers=1
npm run village:collect -- tests/fixtures/village/P1-collection.json <新的输出文件.json>
npm run village:replay -- <采集文件.json> <新的回放文件.json>
```

`village:simulate` 为同一采集入口；输出使用排他创建，不覆盖已有文件。实际采集／回放证据在 `native/Artifacts/village/P1/`。两个模型头另用独立 NumPy FP32 实现对照，误差断言小于 1e-5。测试依赖 Python 和 NumPy；未将它们冒充游戏运行时依赖。

完整检查结果与真实退出码见同目录 `P1-report.json`，全量日志见 `native/Artifacts/village/P1/full-suite.log`。基线寻路失败与耗时用例超时单独列出，不将专项通过写成整仓通过。

最终专项为 15 文件、53 测试全部通过；根目录、新模块类型及 NPC 依赖边界均通过。全量首轮为 771 通过／11 失败；其中 9 项为默认 5 秒超时，使用 60 秒时限分别复跑全部通过。剩余两个 physics 寻路断言与 P0 一致：暂停地面命令恢复到达和同伴阻挡可达目的地；本阶段未修改这些地图／移动实现。全量首轮在实施过程中运行，不能替代最终专项的源文件快照；最终未重复耗时完整套件。

## 审查与裁决

一次独立最终审查发现两项重要缺陷：计数器回退覆盖已有任务／事件，以及社会容器内容未严格验证。均已增加先失败的复现测试，随后补充身份、计数器与协议交叉校验；生产 ID 分配也拒绝碰撞。其他专项覆盖权限、资源、条款哈希和 JS／Python 推理。

T04、S01、S02、T06、T07 与审查修复保留失败测试记录。T05 的首次四项测试在实施后首次运行即通过；这部分不宣称完整 RED→GREEN；随后负库存事务缺陷与审查缺陷确实先复现失败再修复。

工程裁决：公共 action／social／policy 包不反向导入游戏规则；来源共享 SHA256 算法移至 action-runtime，旧导出路径兼容。能力目录目前只开放有期限 WAIT；资源事务以显式 fixture 能力测试，未实现采集／制作／战斗的动作不生成候选。社会协议读档仅开放本阶段能产生的 accepted agreement 与 active plan，后续生命周期必须在后续阶段显式扩展验证器。

## 模型与实际能力边界

本阶段没有训练或发布 v4 权重，也没有把旧 44 维权重接入新模式。测试张量只存于测试过程，来源为 scripted_test；采集文件标记 scripted-test-not-training-data。真实训练仍需 P2 经营与交接执行、P3 战斗与救援执行产生的结果数据。旧游戏继续使用原 v3 模型。

归一化数值是具名工程试验契约，不是 Excel 指定的平衡值。计分是相对动作分数，不是概率。P1 服务不会自动驱动 NPC 策略，真实模型只可通过后续明确接线启用。

## 归档与回滚

阶段归档为 `native/Artifacts/village/P1/stage.zip`；文件哈希在 `P1-SHA256SUMS.json`。归档包含当前源文件与验证证据；共享文件的整份快照仅用于核验，不能整份覆盖回滚其他任务的改动。

当前工作区还包含已接受 P0、Web 清理及其他任务的地图／Unity 在途变更，因此没有混合提交或整仓重置。本阶段通过独立归档和明确改动边界回滚，未执行文档模板中逐任务提交这一建议。

停用时移除 `CAMP_VILLAGE_EXPERIMENTAL=1`，保留新旧数据库数据；撤销代码时仅移除 village 接入、新增的 action／policy／social 模块及 P1 文件、npm 三个场景命令，恢复旧 SHA 导出实现。不要删除旧快照表、源表／P0 时钟／规则、远程模型配置或地图文件；不要依据哈希清单批量删除共享文件。

本阶段是可审查的基础能力交付，未达到完整新玩法或桌面发布验收。依据源执行文档“产出阶段归档包；等待该阶段验收，不自动跨入下一阶段”，本阶段报告后等待用户验收 P1。
