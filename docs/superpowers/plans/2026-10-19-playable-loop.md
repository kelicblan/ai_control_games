# 营地首轮可玩闭环实施计划

> 执行方式：当前会话顺序实施，采用 superpowers:executing-plans；不创建并行实现任务。

**Goal:** 玩家进入游戏后知道做什么，能完成“建设生产设施 → 制作装备 → 指定伙伴领取使用 → 获取资源 → 看见成长与营地改善”的一轮体验。

**Architecture:** TypeScript 世界服务、SQLite 和规则负责权威状态；Unity 负责操作与展示。成长、建筑、工单、装备与成果均从真实状态投影，通知以实际事件为依据。先完成一条可玩链路，再扩展职业和建筑数量。

**Tech Stack:** TypeScript、SQLite、Unity C#、Vitest、Unity EditMode / PlayMode。

**Spec:** 本次聊天中用户认可的闭环方向及本文件下列体验约定。

## 体验约定

1. 玩家定位为营地组织者，同时可以亲自采集、制作、战斗；主要决策是有限物资如何分配、谁承担工作、何时冒险和扩张。
2. 营地页优先展示当前目标、完成条件、实际进度、下一步操作和收益，不用系统模块列表代替目标。
3. 首轮目标链：保障食物 → 建成可工作的工坊 → 做出并实际装备第一把弓 → 狩猎、搬运入库 → 检查成长与营地保障能力 → 选择扩张或加强防卫。
4. 第一轮采用“玩家指定接收人，角色执行交接；NPC 自主装备自己有权使用的武器”。暂不增加不透明的全营地自动分配算法。制作完成、持有、交接与装备分别显示。
5. 工坊必须有权威状态、材料和工时、可达工位、生产用途及 Unity 表现；不能只摆建筑或更换“工位”文案。建造期间的采集与维持生存必须正常工作。
6. 升级先沿用现有数值公式，不无依据改经验平衡。明确展示经验来源、累计经验、下级要求、当前属性、升级增量和实际用途。满级显示满级状态。
7. 升级公告来自权威升级事件；伙伴回应只允许知情且有实际关系或协作依据的人参与，并做去重和限频，不能替全体 NPC 编造祝贺。
8. 目标完成不能靠打开面板或下达命令判定；以完成事件、交接装备记录、仓储增加等真实结果判定。成果保留，当前缺粮等风险另外动态提示。

## Global Constraints

- 唯一开发目录：`D:\workspace_zsfz\ai_control_games\ai_control_games_unity`；旧目录只读。
- Unity 是唯一客户端；不恢复已废弃的 Web 客户端。
- 不覆盖地图、场景、美术、碰撞和其他任务的在途修改；工坊位置使用现有地图可达点，并先检查与现有设施的关系。
- 不清空存档、人物、模型配置或用户设置；旧存档采用有版本、可重复执行的兼容处理。
- 不把 UI 展示成功、规则测试成功、游戏运行验收合并报告。
- 保持 MiniMind3 兜底；语言模型不得直接改变等级、资源、物品或阶段成果。
- 不提交整个脏工作区；记录本次涉及文件，避免纳入用户现有修改。

## Review Focus

- 多次读取、重连、重启与重复事件：不重复发经验、公告、成果或物资。
- 旧存档已有工单和装备：不丢失、不突然作废，不凭空补发材料；兼容策略明确记录。
- 接收人死亡、倒地、离开或无法到达：物品保留在实际持有者处，显示阻塞原因，可重新指定。
- 物资被其他任务预留、建造取消、制造者忙碌：不能超扣、重复消费或假完成。
- 目标达成后资源消耗、武器更换、面板持续打开：历史成果保留，当前状态和进度仍及时更新。

## Task 1：成长可见与真实升级事件

**Files:**
- Modify: `src/games/camp/village/systems/progression.ts`
- Modify: `scripts/world/village-runtime.ts`
- Modify: `native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.Management.cs`
- Modify: `native/CampMind.Unity/Assets/CampMind/Presentation/NativeWorldChannel.cs`
- Test: `tests/village/T10-progression.test.ts`
- Test: `tests/village/ui-catalog.test.ts`

**Interfaces:** 世界投影提供每人经验进度、派生属性、下级增量；升级事件携带来源事件、前后等级和属性变化。投影读取不修改存档。

- [x] 添加去重、跨级、满级、取整、装备叠加、生命策略和存档恢复测试，先确认新增断言失败。
- [x] 实现成长投影和升级事件，保留现有经验来源与数值公式。
- [x] Unity 人物页展示经验进度、收益、当前装备和最近真实贡献；升级公告显示谁升级以及增加多少。
- [x] 伙伴反馈接入已有知识和社会事件链；无知情依据时只显示系统公告。
- [x] 执行 `npx vitest run tests/village/T10-progression.test.ts tests/village/ui-catalog.test.ts --maxWorkers=1 --minWorkers=1`；新增断言和旧断言全部通过。

## Task 2：工坊与生产地点

**Files:**
- Create: `src/games/camp/village/systems/workshop.ts`
- Modify: `src/games/camp/village/domain/economy.ts`
- Modify: `src/games/camp/village/domain/economy-validation.ts`
- Modify: `src/games/camp/village/systems/commands.ts`
- Modify: `src/games/camp/village/systems/life-actions.ts`
- Modify: `src/games/camp/village/ai/candidates.ts`
- Modify: `scripts/world/village-runtime.ts`
- Create: `native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.Workshop.cs`
- Test: `tests/village/workshop.test.ts`

**Interfaces:** 版本化工坊状态提供工位、建设状态和建造执行记录；制造只在可用工位进行，建造与制作共享现有任务、预留、取消、结算机制。

- [x] 先核对当前新地图与兵器铺设施，选择实际可达的工坊位置；材料、工时、旧存档处理写入明确的版本化规则，不沿用空地仓储半径作为生产条件。
- [x] 添加建设消耗、取消退款、重复操作、工位不可达、未建成拒绝制作、完工可制作、旧工单兼容和重启持久化测试，确认失败。
- [x] 实现权威建设与工位校验，调整 NPC 制作候选和移动衔接，避免 NPC 对同一不可执行制作反复提交。
- [x] Unity 提供建造入口、材料缺口、进度、前往工坊和生产状态，并显示实际工坊与工作位置。
- [x] 执行 `npx vitest run tests/village/workshop.test.ts tests/village/T09-orders.test.ts tests/village/T11-life-alpha.test.ts --maxWorkers=1 --minWorkers=1`；验证新增约束不会破坏旧规则场景。

## Task 3：制作去向与明确分配

**Files:**
- Modify: `src/games/camp/village/systems/life-actions.ts`
- Modify: `src/games/camp/village/systems/equipment.ts`
- Modify: `src/games/camp/village/systems/orders.ts`
- Modify: `native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.Management.cs`
- Modify: `native/CampMind.Unity/Assets/CampMind/Presentation/NativeWorldChannel.cs`
- Test: `tests/village/T09-orders.test.ts`
- Create: `tests/village/equipment-delivery.test.ts`

**Interfaces:** 每件物品保留制作者、指定接收人、所有者、持有者、装备者；交接沿用距离与权限规则，不能远程瞬移物品。

- [x] 添加制作完成但未交接、移动交接、不可达、接收人失能、借用品不能擅自转赠、重复交接及取消测试，确认新增失败。
- [x] 明确工单接收人的交付执行路径；保留物品归属和交接事件，不把完工当成已装备。
- [x] 制作页允许指定接收人；人物页展示全体装备和去向，提供合法分配入口；堵塞时解释原因并允许改派。
- [x] 装备详情显示攻击、射程、适用行为以及与当前武器的差值；NPC 自主装备显示真实完成结果。
- [x] 执行 `npx vitest run tests/village/T09-orders.test.ts tests/village/equipment-delivery.test.ts tests/village/social/S08-institutions.test.ts tests/village/social/S08-loan-runtime.test.ts --maxWorkers=1 --minWorkers=1`。

## Task 4：目标、积累与结果反馈

**Files:**
- Create: `src/games/camp/village/systems/milestones.ts`
- Modify: `scripts/world/village-runtime.ts`
- Modify: `native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.Management.cs`
- Modify: `native/CampMind.Unity/Assets/CampMind/Presentation/NativeVillageUi.Hud.cs`
- Create: `tests/village/milestones.test.ts`

**Interfaces:** 版本化阶段记录保存真实完成证据；只读投影提供当前目标、分子分母、下一步入口、当前风险、已完成成果。目标奖励第一轮以实际资源、成长、装备及已开放能力呈现，不虚构新奖励。

- [x] 添加“命令接受不算完成”、肉仍在背包不算入库、已完成目标不因食物消耗倒退、重启不重发及旧存档已有成果识别测试，确认失败。
- [x] 连接建设、制作、装备、狩猎和搬运事件；以实际世界时间和当前人口解释食物保障，不把仓储总量误称为可持续天数。
- [x] 营地页顶部和 HUD 展示一个当前目标、实际积累及可操作的下一步；首轮完成后显示扩张与防卫的明确取舍和条件。
- [x] 执行 `npx vitest run tests/village/milestones.test.ts tests/village/ui-catalog.test.ts --maxWorkers=1 --minWorkers=1`。

## Task 5：完整链路验收与交付

**Files:**
- Create: `tests/village/playable-loop.test.ts`
- Create: `native/CampMind.Unity/Assets/CampMind/Tests/Editor/PlayableLoopPresentationTests.cs`
- Create: `docs/implementation/2026-10-19-playable-loop-validation.md`

- [x] 在权威集成夹具中完成保障食物、建设、制弓、装备、真实狩猎、入库、升级及后续目标；实物交接单独覆盖，逐步断言真实状态、资源收支与事件证据。
- [x] 对有现存工单和装备的旧档执行兼容及 SQLite 重开验收；用户配置保持不变。
- [x] 执行 `npm run check:village` 和 219 项 Vitest 回归；真实重新采样训练及 12 个留出生产装备场景验证通过，模型质量与规则夹具分开报告。
- [x] 执行带实际 Editor 路径及 `-GuardBuildReportPort` 的 EditMode 展示测试，3/3 通过；原生截图检查通过。
- [x] 构建、同包新旧档及动物验收、正式发布，并通过实际 `运行游戏.cmd` 启动正确包；代码/规则/模型/原生操作证据分别报告。
- [ ] 人工连续完整试玩首轮链路并确认长期乐趣；自动原生操作覆盖工坊、制弓、装备、成长目标与狩猎入口，不将规则全链路通过冒称为人工完整试玩。

## 当前状态

- [x] 已核对当前成长公式、经验授予、制作工单、物品归属、装备权限、NPC 装备候选、Unity 制作与人物页。
- [x] 已明确第一轮体验、实现边界和验收方法。
- [x] 用户已确认按本计划在当前会话顺序实施。
- 执行证据见 `docs/implementation/2026-10-19-playable-loop-validation.md`。
