# NPC 社会认知、互动履约与内容审核实施清单

> **For agentic workers:** 使用 superpowers:executing-plans 按任务逐项实施；本文件只记录计划，不代表功能已实现。未经用户要求，不自动提交其他已有改动。

**Goal:** 保留 MLP 驱动世界自动运转，让大模型赋予 NPC 持续的社会认知与可执行意图；玩家通过安全候选项参与互动，全部可见文本经过审核。

**Architecture:** MLP 负责基础生存和行动选择；大模型根据事实、记忆和关系提出社会意图；权威世界服务校验并执行。消息、回应、约定、行动结果和记忆形成闭环，SQLite 持久化事实，渲染层只展示。审核是独立的服务端发布门禁，不阻塞世界 tick。

**Tech Stack:** TypeScript、React、现有世界服务与 SQLite、现有模型管理器、Vitest、Playwright。

**执行记录（2026-10-15）：** 核心代码已接入，用户追加的“更换一批”已实现并通过浏览器验证。逐项证据、实际运行服务和未通过项见 [验收报告](../../validation-social-agency-moderation.md)；本清单未整体勾选，尤其不把真实模型安全兜底算作履约验收成功。

## 已确认约束

- NPC 互相 @ 与玩家 @ NPC 都有可追踪的回应；NPC @ 玩家由真人选择，不能自动替玩家答应。
- 玩家无自由文本输入；多个候选项，每次选择其中一个。生成候选项不产生承诺。
- 选项都不合心意时可点击“更换一批”；重新生成和审核，作废旧批次，不发送消息、不代玩家承诺。
- 大模型影响目标、关系判断、协商与计划，不能只润色台词，也不能凭文本直接修改世界事实。
- 所有识别出的违规片段替换为字面量 `**`。语义不安全的整条提议不得通过屏蔽文字继续执行。
- UTF-8 文件 `config/moderation/blocked-words.txt`：一行一词或短语、空行忽略、整行 # 注释、字面匹配、去重、重叠优先长词、热加载。
- 热更新失败保留上次有效词库；冷启动词库不可用时使用预审安全兜底。明确允许有效空词库，但不能因此关闭语义审核。
- 不承诺识别全部违规表达；验收针对明确规则、已配置词库和审核器契约。
- 当前仓库有大量已有修改，逐文件核对并保留，不整体覆盖、不随意回滚。

## 执行约定与依赖

每项任务均执行：补行为测试 → 确认测试暴露缺口 → 最小实现 → 运行指定测试 → 更新本清单及证据。避免断言实现细节的镜像测试。未经执行不得勾选。

顺序：T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11 → T12。T02 的模型协议必须先确定，T04 发布门禁完成前不开放新生成内容。

## T01 基线、数据链路和变更边界

**涉及文件：** `src/games/camp/dialogue/session.ts`、`src/games/camp/dialogue/records.ts`、`src/games/camp/simulation/social.ts`、`src/games/camp/npc/agency.ts`、`scripts/world/runtime.ts`、`scripts/world/store.ts`、`src/components/SocialDialog.tsx`。

- [ ] 记录工作区状态、当前运行进程及服务版本；区分修改源码和正在运行的服务。
- [ ] 追踪消息生成、持久化、展示、NPC 决策和玩家命令的所有入口，包括客户端本地模型输出提交路径。
- [ ] 记录现有相关测试基线：`npx vitest run tests/dialogue-session.test.ts tests/social.test.ts tests/npc-agency-end-to-end.test.ts tests/world-http.test.ts`，不以空测试作为通过证据。
- [ ] 确定旧存档备份与回滚步骤；不得重置现有玩家世界来规避迁移。

**验收：** 有端到端链路图或文字映射、真实测试结果及已有失败清单。

## T02 社会认知协议与权威边界

**新增：** `src/games/camp/social/types.ts`、`src/games/camp/social/validation.ts`、`tests/social-protocol.test.ts`。
**修改：** `src/games/camp/npc/agency-types.ts`、`src/games/camp/simulation/types.ts`、`packages/npc-dialogue/src/types.ts`。

- [ ] 定义消息 ID、senderId、recipientIds、replyToId、线程 ID、世界代次及修订号，不靠显示文本中的 @ 路由。
- [ ] 定义结构化社会意图：邀请、接受、拒绝、询问、提出地点、改期、取消、结束交谈；保留可扩展的意图注册边界。
- [ ] 定义候选项 ID、对应意图、参数、上下文修订、过期时间与审核版本。
- [ ] 定义约定参与者、真实地点 ID、确认状态、期限、中断原因、恢复策略和事件序号。
- [ ] 对模型输出做 schema、身份、地点、参与者、状态和证据校验；拒绝伪造到场、关系变化和资源结果。
- [ ] 区分模型建议、已接受计划、实际完成事实；主观印象不得直接成为客观记忆。
- [ ] 执行 `npx vitest run tests/social-protocol.test.ts`。

**验收：** 无效输出无世界副作用，过期、重放和跨世界提交被拒绝。

## T03 可配置词库与热更新

**新增：** `config/moderation/blocked-words.txt`、`scripts/world/moderation/lexicon.ts`、`scripts/world/moderation/matcher.ts`、`tests/moderation-lexicon.test.ts`。

- [ ] 实现 UTF-8/BOM 读取、空行及整行注释、去重、词长与文件大小限制；词语按字面解释。
- [ ] 为大小写、全半角、零宽字符及约定的分隔符变体建立规范化匹配与原文位置映射；控制跨词误伤。
- [ ] 合并重叠命中区间，整个命中片段替换为 `**`；验证中文、emoji 和重叠长短词不破坏文本。
- [ ] 文件监听加周期校验与防抖，兼容编辑器原子替换；完整读完后原子切换版本。
- [ ] 对读取异常及疑似写入中的临时内容重试；失败保留上版，冷启动不可用则进入安全模式。
- [ ] 使用虚构测试词验证新增、删除、空词库、无权限、删除重建和无需重启生效。
- [ ] 执行 `npx vitest run tests/moderation-lexicon.test.ts`。

**验收：** 修改文本文件可观察到版本变化，随后发布内容按新版本审核。

## T04 服务端审核与安全兜底

**新增：** `scripts/world/moderation/service.ts`、`scripts/world/moderation/provider.ts`、`scripts/world/moderation/fallbacks.ts`、`tests/moderation-service.test.ts`。
**修改：** `scripts/world/runtime.ts`、`scripts/world/server.ts`、`src/games/camp/dialogue/records.ts`、`src/games/camp/dialogue/session.ts`。

- [ ] 选定并配置实际语义审核实现，明确输入、超时、返回判定、版本和失败策略；不能把接口桩当作已接入。
- [ ] 以原始完整语义审核，再执行词库屏蔽；审核结论覆盖整条内容与动作意图。
- [ ] 仅文字命中可屏蔽后发布；整条意图不安全时废弃动作及关联选项，换安全拒绝或结束文本。
- [ ] 审核超时、异常、不可用时默认关闭生成内容发布，使用预审安全兜底；不暂停 MLP tick。
- [ ] 兜底文本也通过当前词库处理；若无法安全表达，使用固定 UI 状态而非继续生成。
- [ ] 客户端模型结果视为不可信输入；服务端审核确认前不得回显气泡或频道文字。
- [ ] 异步审核完成后、发布前复核世界代次、上下文修订及最新审核/词库版本；期间 reset、取消或更新词库须丢弃或重新审核，旧结果不能执行动作。
- [ ] 存储审核后的文本及必要的决策元数据；普通日志不写原始被拒内容，错误消息不透传模型原文。
- [ ] 输出 source 区分模型、屏蔽后的模型文本和规则兜底，避免将兜底标记为模型生成。
- [ ] 执行 `npx vitest run tests/moderation-service.test.ts tests/dialogue-session.test.ts`。

**验收：** 可见输出、数据库发布记录及动作执行均不能绕过审核。

## T05 @ 路由与有界回应队列

**新增：** `src/games/camp/social/inbox.ts`、`scripts/world/social-scheduler.ts`、`tests/social-inbox.test.ts`。
**修改：** `src/games/camp/dialogue/session.ts`、`src/games/camp/simulation/social-types.ts`、`src/gameMessages.ts`、`scripts/world/runtime.ts`。

- [ ] 每条有效定向发言为每个目标建立待回应任务，记录待处理、生成、已回应、失败或无法回应。
- [ ] 回应者和回复对象严格对应，阿野邀请林枫只能由林枫以该邀请为上下文回应。
- [ ] 明确拒绝和稍后回应同样算回应；死亡、离开等不可回应情况显示状态，不能伪造角色发言。
- [ ] 加入去重、有限重试、公平调度、超时与安全兜底；显式 @ 优先于环境闲聊。
- [ ] 使用会话结束信号、轮数上限、冷却防止无限互相 @；保证终结消息有已读/结束状态，不强制再生一句话。
- [ ] NPC @ 玩家产生待选择交互，等待玩家，不自动代答；多目标各自独立回应。
- [ ] 执行 `npx vitest run tests/social-inbox.test.ts tests/dialogue-dependencies.test.ts`。

**验收：** 不串人、不漏有效邀请、不无限循环；模型故障仍有明确可见结果。

## T06 玩家候选回复与自由文本封闭

**新增：** `scripts/world/player-choices.ts`、`src/components/PlayerReplyChoices.tsx`、`tests/player-choices.test.ts`。
**修改：** `src/components/SocialDialog.tsx`、`src/components/CommandDock.tsx`、`src/integrations/world/client.ts`、`scripts/world/runtime.ts`、`src/games/camp/simulation/social.ts`。

- [ ] 根据最近对话、人物关系、事件、玩家处境生成建议 3–5 个有实际差异的选项；提供拒绝或结束选择。
- [ ] 服务端生成并保存已审核选项与动作映射；玩家仅提交选项 ID、上下文版本和操作 ID。
- [ ] 服务端忽略客户端附带的文案和动作，拒绝未知、篡改、过期、跨线程选项；重复点击不重复执行。
- [ ] 移除聊天 textarea；盘点其他玩家公开文本入口并改为受控选择，不移除模型连接等非游戏表达配置。
- [ ] 拒绝旧 `social-chat` 任意文本接口，包括直接构造网络请求；保留必要旧存档读取能力。
- [ ] 状态改变时刷新选项；审核版本改变时重新审核，失效选项不可提交。
- [ ] 模型/审核失败显示安全固定选项；选择前不记录玩家发言、不形成承诺。
- [ ] 执行 `npx vitest run tests/player-choices.test.ts`。

**验收：** UI 和 API 都无法任意提交玩家台词，选项对应动作一致且只执行一次。

## T07 社会认知影响实际决策

**新增：** `src/games/camp/social/cognition.ts`、`src/games/camp/social/plans.ts`、`tests/social-cognition.test.ts`。
**修改：** `src/games/camp/npc/appraisal.ts`、`src/games/camp/npc/agency.ts`、`src/games/camp/npc/experience.ts`、`scripts/world/minimind-appraisal.ts`。

- [ ] 将社会事件、关系、可信记忆、身体需求、工作和环境组织为有界上下文。
- [ ] 支持主动产生社交动机与邀约，而非只有被 @ 才响应；设置预算和冷却。
- [ ] 让接受、拒绝、协商、改期受性格、关系及实际处境影响，不能强制所有角色同意。
- [ ] 明确优先级：紧急生存与合法性约束 → 已确认社会计划与当前任务协调 → 常规 MLP 行动；玩家控制不得被模型抢夺。
- [ ] 社会计划拥有生命周期，不因下一次普通 MLP 推理立即被覆盖；同时保留合理中断与恢复。
- [ ] 模型关闭或失败时 MLP 正常工作，已有约定按确定性规则处理。
- [ ] 执行 `npx vitest run tests/social-cognition.test.ts tests/npc-agency-end-to-end.test.ts tests/policy.test.ts`。

**验收：** 相同基础需求可因不同关系产生不同社会选择，并能观测到实际计划变化。

## T08 协商地点与真实赴约

**新增：** `src/games/camp/social/appointments.ts`、`src/games/camp/social/locations.ts`、`tests/social-appointments.test.ts`。
**修改：** `src/games/camp/simulation/engine.ts`、`src/games/camp/world/navigation.ts`、`src/games/camp/npc/world-context.ts`。

- [ ] 从真实地点目录选择目的地，校验天气适宜性、可达性、寨门和参与者活动空间；模型不得虚构坐标。
- [ ] 双方确认地点和时机后创建约定；含糊接受进入澄清阶段，不能直接视为已到场。
- [ ] 实现待确认、已约定、赴约、等待、交谈、完成、取消、过期状态及合法转换。
- [ ] 协调手头工作、携带物资和已有约定，避免丢货、同时赴多个约或无故抢占救援任务。
- [ ] 复用实际寻路；双方在同一可交谈空间且距离达标才进入现场聊天，不能隔墙判断仅距离。
- [ ] 玩家参与时只给指引和等待状态，玩家自行移动；NPC 不控制玩家赴约。
- [ ] 处理关门、路径阻断、迟到、饥饿、受伤、危险、死亡及取消；通知对方并决定改期/终止。
- [ ] 执行 `npx vitest run tests/social-appointments.test.ts tests/world-navigation.test.ts tests/social-behavior.test.ts`。

**验收：** 阿野和林枫真实抵达后才交谈，不能用频道文字作为赴约成功证据。

## T09 现场交流、关系和记忆闭环

**新增：** `src/games/camp/social/conversations.ts`、`tests/social-outcomes.test.ts`。
**修改：** `src/games/camp/npc/experience.ts`、`src/games/camp/simulation/social.ts`、`scripts/world/memory-store.ts`。

- [ ] 到场后启动有界交谈，支持澄清、结束及后续提议；新承诺再次经过校验和确认。
- [ ] 根据实际发生的等待、赴约、爽约、帮助等事件更新关系；不能仅因模型声称成功增加信任。
- [ ] 记忆区分听说、主观判断、行动意图及已验证事实；限定知情者，禁止全员自动获知私人对话。
- [ ] 区分合理遇险和无故爽约；结果影响后续邀请与回应。
- [ ] 记忆中使用审核后的表达，防止被拒原文通过后续回忆重新输出。
- [ ] 执行 `npx vitest run tests/social-outcomes.test.ts tests/npc-memory.test.ts tests/npc-experience-integration.test.ts`。

**验收：** 履约结果可追踪并影响后续决策，重复恢复不重复增减关系。

## T10 存档迁移、离线恢复与旧内容审核

**新增：** `tests/social-persistence.test.ts`、`tests/moderation-history.test.ts`。
**修改：** `src/games/camp/simulation/persistence.ts`、`scripts/world/store.ts`、`scripts/world/runtime.ts`、`src/gameMessages.ts`。

- [ ] 持久化待回应任务、选项、约定、计划和已处理事件 ID；身份与玩家世界隔离。
- [ ] 旧存档缺字段时安全初始化，不改变既有角色、资源、建筑和世界进度。
- [ ] 重启恢复与离线补算采用确定性规则；不在补算中无限调用模型，不凭空补造离线对话和赴约事实。
- [ ] reset、切换世界、暂停及恢复使旧请求失效；已发布事实与未执行计划分开恢复。
- [ ] 旧历史及缓存展示前按当前词库重新屏蔽；词库更新后使已显示内容和可提交选项失效/刷新。
- [ ] 未有有效语义审核记录的旧历史、记忆与缓存，首次展示前执行服务端语义审核；失败隐藏或安全兜底，覆盖不命中词库的语义违规旧内容。
- [ ] 将已回应标记与消息、选项消费与意图落地、关系变化与已处理事件分别纳入原子事务或等效幂等提交；在写入边界注入崩溃，验证重启后只产生一次效果。
- [ ] 清理活动缓存中的原始违规文本；不要求删除用户已有备份，但不得将备份内容绕过门禁展示。
- [ ] 执行 `npx vitest run tests/social-persistence.test.ts tests/moderation-history.test.ts tests/persistence.test.ts tests/world-reset.test.ts`。

**验收：** 重启不丢约、不重复回复；历史屏蔽跟随词库更新。

## T11 桌面交互与可观测性

**新增：** `tests/social-presentation.test.ts`。
**修改：** `src/components/WorldChannel.tsx`、`src/components/SocialDialog.tsx`、`src/components/NpcMemoryPanel.tsx`、`src/gameMessages.ts`、相关 CSS。

- [ ] 展示回复关联、对话双方、等待回应、约定地点、赴约/等待/取消状态与玩家候选项。
- [ ] 所有气泡、频道、详情、记忆、通知与错误提示使用统一审核输出；`**` 按字面显示。
- [ ] 加入词库版本、审核失败数、队列延迟、兜底数和约定中断原因等诊断数据，不泄露原始违规文本。
- [ ] 控制模型并发、上下文长度、请求预算和队列长度；观察 tick 延迟与桌面帧率，不把历史性能问题算作本次已修复。
- [ ] 执行 `npx vitest run tests/social-presentation.test.ts tests/world-channel.test.ts tests/world-channel-filters.test.ts`。

**验收：** 用户能从界面看到发生了什么，界面不提前宣称模型任务或赴约已经完成。

## T12 集成验收与交付

**新增：** `e2e/social-agency.spec.ts`、`e2e/moderation.spec.ts`、`docs/validation-social-agency-moderation.md`、`docs/moderation-operations.md`。

- [ ] 自动验收 NPC → NPC：阿野邀请林枫，正确回复、协商、真实移动、会面、结束和记忆反馈。
- [ ] 自动验收玩家 → NPC 与 NPC → 玩家：通过候选项接受/拒绝/改期，不代玩家答复，不允许自由输入。
- [ ] 验收多目标、重复消息、并发邀请、迟到、死亡、道路阻断、危险中断、重启和旧存档。
- [ ] 验收词库增删热更新、变体命中、重叠词、审核超时、不可用、候选项篡改及旧接口直连绕过。
- [ ] 验收延迟审核与 reset、取消、词库更新并发，旧存档语义违规，以及提交边界崩溃恢复。
- [ ] 运行相关 Vitest 测试、`npm run check:npc`、`npm run build`，记录真实输出；再运行完整 `npm test`，分开报告已有失败。
- [ ] 运行 `npx playwright test e2e/social-agency.spec.ts e2e/moderation.spec.ts`；真实浏览器检查气泡、频道、选项和 NPC 位置。
- [ ] 使用实际配置模型做一次端到端验证；假模型测试、真实模型表现及真实审核器验证分别列证据，缺失项明确标注。
- [ ] 发布前备份 SQLite，重启正确世界服务，确认健康检查和新协议/词库版本；若未获部署范围授权仅交付代码与步骤。
- [ ] 编写词库编辑、编码、注释、热加载观察、故障兜底、服务重启及回滚说明；回滚同时处理数据库兼容性。

**完成标准：** 构建/相关测试通过、有真实移动和安全输出的浏览器证据；已知失败和未验证事项明确记录。不得用模板聊天演示代替大模型决策验收，不得用测试通过代替运行服务已更新。

## 首期范围与扩展边界

本期完成通用社会意图框架及 @—回应—协商—赴约—交谈—记忆闭环，保留已有协作、诉求及群体机制。复杂经济、组织制度、婚恋、完整多人政治等不在本期自动扩展；后续复用同一意图、审核、执行与记忆机制接入。

实际实施前需落实的技术配置：语义审核后端与可用凭据、真实可会面地点目录、队列预算及超时默认值。可先实现确定性规则和接口测试，但这些配置未落实时不得宣称完整语义审核或真实模型验收已完成。
