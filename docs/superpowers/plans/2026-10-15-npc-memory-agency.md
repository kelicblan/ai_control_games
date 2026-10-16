# NPC Memory and Social Agency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 当前会话默认顺序执行；只在用户授权时委派实现子任务。

**Goal:** 让每个 NPC 根据真实经历、身体属性、性格和关系形成持续情绪与自主行为，并支持真实交流驱动的组织罢工与集体交涉。

**Architecture:** 保留八动作 MLP，增加事件记忆、异步结构化认知和高层概率意图策略。通用契约放在 NPC 包，营地执行映射放在适配层，世界服务负责模型调度、SQLite 事务和重放。首版高层评分器为 `utility-v1`，不是已训练的新神经网络。

**Tech Stack:** TypeScript、Node `node:sqlite`、现有 React/Three.js、Vitest、现有模型适配和桌面浏览器验收。复用项目依赖，不新增数据库或训练框架。

---

## 工作区与操作约束

规格：`docs/superpowers/specs/2026-10-15-npc-memory-agency-design.md`。所有下述路径相对 `D:/workspace_zsfz/ai_control_games/ai_control_games`。

当前主工作区有大量既有未提交功能，不能从 HEAD 新建空白 worktree 后当作当前游戏实现。实施前记录文件状态和相关差异，优先在当前工作区做最小修改；若需要隔离，先按 using-git-worktrees 流程保全并复制所需未提交状态，再核对基线等价。不使用 reset/clean/stash 清掉他人工作。

文档可单独提交；实现提交只包含本任务改动。若某文件同时有既有改动，按差异片段审查后提交，不能以整文件添加吞入他人工作。中文文件使用小范围 apply_patch 并以 UTF-8 核查。

生产/当前运行数据库在真实迁移前必须备份，保留配对的 `.remote-key` 文件，备份内容和密钥不输出到聊天。首先在临时数据库执行迁移、恢复和重置实验。当前日期不作为模拟时间。

## 共用契约与初始参数

以下为实施初值，集中放在版本化参数文件；测试固定参数，不在代码中散落阈值：

```ts
export const AGENCY_V1 = {
  version: 'utility-v1', recentLimit: 48, evidenceLimit: 12,
  summaryBatch: 64, maxActiveGroups: 3,
  perNpcInflight: 1, globalInflight: 2,
  appraisalCooldown: 15, invitationCooldown: 30,
  intentMinDuration: 10, appraisalTtl: 45,
  maxEmotionDelta: 0.08, modelPreferenceLimit: 0.25,
  maxInvitationsPerNpcPerRound: 1,
} as const;
```

时间单位为模拟秒；网络超时单独使用墙钟，初值 20 秒。身体属性以 0.1 宽度分桶校验过期。严重身体危险始终由当前状态处理，不等待认知。情绪衰减沿用原心智时间机制；模型评价不因每次调用而累计奖励。

核心数据标识：`worldGeneration + branchId + npcId + sequence`。事件 ID 单独稳定生成并持久化，不使用模型返回的 ID。分支带 parentBranch、forkWatermark，读取祖先只允许其分叉水位以前的数据。摘要、模型证据、集体事件和认知结果均携带分支与水位。所有编号、长度、枚举和数值上界在持久化入口与模型入口验证。

## Task 1：运行基线和参数契约

**Create:** `packages/npc-core/src/agency-config.ts`, `tests/npc-agency-config.test.ts`, `docs/validation-npc-memory-agency.md`。
**Modify:** `packages/npc-core/src/index.ts`。

- [ ] 记录 `git status --short`；读取现有世界进程和数据库配置但不打印密钥；执行 `npm run test -- tests/social-behavior.test.ts tests/world-reset.test.ts tests/persistence.test.ts`，记录既有失败。
- [ ] 写参数校验测试：不接受负数/NaN/未知版本；默认配置满足内存和并发上界。运行 `npm run test -- tests/npc-agency-config.test.ts`，确认因契约缺失失败。
- [ ] 添加上述配置与类型化校验，导出公共入口；不更改现有行为默认值。
- [ ] 重跑该测试，预期 PASS；记录九人运行下模拟批次耗时、快照字节和数据库大小，作为最终对照。

## Task 2：经历契约和有界工作集

**Create:** `packages/npc-core/src/memory-types.ts`, `packages/npc-core/src/memory.ts`, `tests/npc-memory.test.ts`。
**Modify:** `packages/npc-core/src/types.ts`, `validation.ts`, `index.ts`。

- [ ] 写测试覆盖同事件去重、事实/传闻/自我表达区分、未知事件拒绝、知情集合、48 条工作集裁剪且未解决事项独立保留；运行 `npm run test -- tests/npc-memory.test.ts`，预期 FAIL。
- [ ] 定义经历字段 `eventId, sequence, at, category, actorId, audience, fact, interpretation, evidenceIds, source, salience`；世界/分支上下文由宿主注入，通用模块不能依赖营地名单或数据库。
- [ ] 实现纯函数 `appendExperience` 和工作集投影，保留原 `MindMemory` 的兼容入口。旧 v1 心智可读，新字段缺省初始化，不猜造历史。
- [ ] 重跑测试及 `npm run check:npc`，预期 PASS。每个事件 ID 的重放不得再次修改计数。

## Task 3：SQLite 日志与原子快照

**Create:** `scripts/world/memory-schema.ts`, `memory-store.ts`, `tests/npc-memory-store.test.ts`。
**Modify:** `scripts/world/store.ts`, `runtime.ts`。

- [ ] 临时 SQLite 写测试：日志与快照同提交、快照校验失败两者均不写、插入中途故障全部回滚、重复操作仅一次、两玩家隔离。运行 `npm run test -- tests/npc-memory-store.test.ts`，预期 FAIL。
- [ ] 在 SnapshotStore 持有的同一连接上创建 schema version、world_generations、memory_branches、npc_experiences、npc_summaries、npc_appraisals、social_collectives 表。认知/群体表此时可先只建契约，不实现业务。索引覆盖玩家/代次/分支/NPC/序号；唯一键包含事件 ID。
- [ ] 将保存事务扩展为快照、待提交经历、认知结果和群体事件共同提交；提交成功才清除内存 outbox。失败不得让未保存世界继续成为可读权威：恢复事务前 checkpoint 或阻止该世界后续推进直到重载成功。
- [ ] 事件在模拟中进入有界 outbox；临近容量时先持久化，保存失败中止本世界推进并报告错误，不静默丢日志、不无限堆内存。数据库方法不得在纯模拟循环内部调用。
- [ ] 重跑测试与 `npm run test -- tests/world-client.test.ts tests/world-reset.test.ts`，预期新测试 PASS、既有回归不新增。

## Task 4：迁移、分支恢复和重置

**Create:** `scripts/world/memory-migration.ts`, `tests/npc-memory-recovery.test.ts`。
**Modify:** `scripts/world/store.ts`, `runtime.ts`, `src/games/camp/simulation/persistence.ts`, `src/integrations/world/resetStorage.ts`, `tests/world-reset.test.ts`。

- [ ] 写测试：旧存档只导入仍存在的证据；快照回退后不能读取未来日志/摘要/认知/群体状态；分叉后祖先水位严格截断；重启不重复导入；未来版本保留并报错。运行 `npm run test -- tests/npc-memory-recovery.test.ts`，预期 FAIL。
- [ ] 快照新增可缺省的 agency 元数据；兼容当前恢复器的版本检查和载荷上限，明确计算工作集预算，不简单放宽所有校验。恢复生成新分支并原子保存新 checkpoint，保留旧分支诊断。
- [ ] 重置在同一事务清除该玩家所有旧代次的日志、摘要、认知、群体、操作及快照；代次更新后旧请求必失效。保留模型配置与 NPC 初始设置。
- [ ] 重跑恢复、重置及 `npm run test -- tests/persistence.test.ts tests/npc-persistence.test.ts tests/reset-storage.test.ts`，预期 PASS 或仅原有基线失败。

## Task 5：统一记录行为与三种交流

**Create:** `src/games/camp/npc/experience.ts`, `tests/npc-experience-integration.test.ts`。
**Modify:** `src/games/camp/simulation/engine.ts`, `social.ts`, `vocal.ts`, `npc/bridge.ts`, `dialogue/commit.ts`, `scripts/world/runtime.ts`。

- [ ] 写测试覆盖动作结果、自主恢复、自言自语、玩家交流、多 NPC 交流；无关 NPC 不知情；模板与模型润色同一发言仅一条经历。运行 `npm run test -- tests/npc-experience-integration.test.ts`，预期 FAIL。
- [ ] 逐一审计所有 `npc.speech` 写入和 action 完成路径，接到统一发布函数；为发言分配稳定 speechEventId。社交参与者依据实际线程接收，自言自语默认仅本人，只有明确可听见的现场事件才扩展听众。
- [ ] 世界服务的 caption 提交与本地 applyDialogue 共享“修订已有发言”语义；新增修订序号而不添加第二次交流奖励。润色提交仅能更新文本，不能伪造新的承诺或已完成任务。
- [ ] 将工作负担的他人信息改为实际观察/交流得到的有界记录；保留本人累计劳动的真实数据，禁止通过全员当前工作量泄漏未知事实。
- [ ] 重跑该测试及 `npm run test -- tests/dialogue.test.ts tests/social.test.ts tests/engine.test.ts`；预期新增语义测试 PASS。

## Task 6：检索与长期摘要

**Create:** `packages/npc-core/src/memory-retrieval.ts`, `scripts/world/memory-summary.ts`, `tests/npc-memory-retrieval.test.ts`。
**Modify:** `scripts/world/memory-store.ts`, `src/games/camp/dialogue/context.ts`。

- [ ] 写测试：旧重要拒绝优先于新闲聊；恢复分支过滤；未兑现承诺必入上下文；分页稳定；摘要证据可追踪；摘要失败不丢原文。运行 `npm run test -- tests/npc-memory-retrieval.test.ts`，预期 FAIL。
- [ ] 检索纯评分为主题匹配、对象匹配、未解决标志、重要度与时间衰减，稳定序号破同分；先执行知情/分支过滤再排序。候选分页从数据库取，工作决策仅读快照缓存。
- [ ] 每 64 条经历形成按主题的确定性证据摘要，标注覆盖水位和 unresolved IDs；后续模型可给摘要润色但不得增加无证据事实。记录摘要版本及原文 ID，不删除日志。
- [ ] 字幕仍使用既有短预算，但将最相关记忆替代简单 slice(-1)；认知使用单独上下文预算。重跑测试与既有 dialogue 测试，预期 PASS。

## Task 7：结构化认知协议和模型适配

**Create:** `packages/npc-dialogue/src/appraisal-types.ts`, `appraisal-validation.ts`, `appraisal-prompt.ts`, `scripts/world/appraisal-provider.ts`, `tests/npc-appraisal-protocol.test.ts`。
**Modify:** `packages/npc-dialogue/src/index.ts`, `scripts/world/remote-models.ts`, `scripts/native-models/remote.ts`。

- [ ] 写测试覆盖未知字段、非法意图、虚构证据 ID、越界情绪、提示词注入、无效 JSON 和协议大小上限；运行 `npm run test -- tests/npc-appraisal-protocol.test.ts`，预期 FAIL。
- [ ] 输入使用已检索证据、当前属性、性格及合法候选。输出固定 `version, summary, evidenceIds, emotionAssessment, goal, preferences, expression`；交流目标必须属于已知且合法的人物集合。
- [ ] 新增内部 cognition completion 调用，不复用字幕 48 字输出校验或通常仅 64 tokens 的生成参数；输入上限 6000 字符、输出预算 768 tokens、响应 JSON 文本上限 12000 字符。沿用现有 HTTP、地址、密钥与超时边界，不改变字幕请求默认参数。不让客户端直接提交被信任的模型评价。
- [ ] 认知后端选择持久化 remote model ID，复用现有配置。缺省不选；需要用户在既有设置中明确启用该已保存模型用于认知。配置删除/切换使旧任务失效。结构化成功才记录 capability；失败仅降级，不声称 MiniMind3 具备认知能力。
- [ ] 重跑该测试与 `npm run test -- tests/remote-http.test.ts tests/remote-credentials.test.ts`，预期 PASS，不输出凭据。

## Task 8：后台调度、结果接纳与重放

**Create:** `scripts/world/appraisal-scheduler.ts`, `appraisal-queue.ts`, `tests/npc-appraisal-scheduler.test.ts`, `tests/npc-appraisal-replay.test.ts`。
**Modify:** `scripts/world/server.ts`, `runtime.ts`, `src/games/camp/simulation/types.ts`, `persistence.ts`。

- [ ] 写假时钟/受控 provider 测试：每 NPC 一请求、全局两请求、超时降级、合并重复触发、页面关闭仍可调度、暂停不累计模拟冷却。运行 `npm run test -- tests/npc-appraisal-scheduler.test.ts`，预期 FAIL。
- [ ] 在 tick 后提交认知作业，异步响应仅进入队列；下一模拟边界核验 generation/branch/NPC/诉求及意图修订/证据水位/身体桶/TTL/模型选择修订。整个世界普通 revision 改变不能导致所有回答失效。
- [ ] 有效结果以幂等 appraisal ID 写入同事务并带接纳模拟时间。情绪调整用证据贡献账本按事件和情绪通道去重、融合限幅；工作集可裁剪但去重水位不可随之遗失。
- [ ] 新增重放测试：记录一次认知序列后换一个会报错的 provider，仍可重放出相同意图/随机状态/物资。新分支、重置、死亡、提供商切换均拒收旧回答。
- [ ] 运行 `npm run test -- tests/npc-appraisal-scheduler.test.ts tests/npc-appraisal-replay.test.ts`，预期 PASS，所有模型失败用例的模拟仍持续推进。

## Task 9：概率意图策略和身体边界

**Create:** `packages/npc-core/src/intent-policy.ts`, `src/games/camp/npc/agency.ts`, `tests/npc-intent-policy.test.ts`, `tests/npc-strike-survival.test.ts`。
**Modify:** `packages/npc-core/src/runtime.ts`, `index.ts`, `src/games/camp/npc/bridge.ts`。

- [ ] 写固定种子集合测试：非法意图概率零、归一化为一、同输入/种子同输出、不同性格分布趋势不同、冷却期不反复抽样。运行 `npm run test -- tests/npc-intent-policy.test.ts`，预期 FAIL。
- [ ] 分离意图合法性、utility 评分、归一化和采样；保留原心智评估降级。模型偏好限 ±0.25；记录 features、候选、概率、randomBefore/After、版本、最终执行 override。解释性标签不得冒充网络推理。
- [ ] 加真实执行测试：罢工时食物库存低不能强制采集；危急吃饭、休息、避险可执行；背包返送保持原冲突立场；玩家指令不能清空拒工。
- [ ] 生产劳动、自救和帮助分开判断；“选择帮助”由 NPC 独立意图决定，不把全部 aid 当无条件强制。使用既有安全阈值和动作合法性，不复制第二套资源执行器。
- [ ] 运行 `npm run test -- tests/npc-intent-policy.test.ts tests/npc-strike-survival.test.ts tests/social-behavior.test.ts tests/survival-reserve.test.ts`，预期新用例 PASS；既有保底测试按已确认罢工边界调整而非删掉生存校验。

## Task 10：面对面招募与群体事件

**Create:** `src/games/camp/npc/collective-types.ts`, `collectives.ts`, `recruitment.ts`, `tests/npc-collectives.test.ts`, `tests/npc-recruitment.test.ts`。
**Modify:** `src/games/camp/simulation/social-types.ts`, `social.ts`, `engine.ts`, `world/navigation.ts`, `scripts/world/runtime.ts`。

- [ ] 写测试：受邀者独立接受/拒绝/劝解；同轮同人仅邀一次；未听见者不参与；不可达和闭寨门不穿墙；最多三个活跃群体。运行 `npm run test -- tests/npc-collectives.test.ts tests/npc-recruitment.test.ts`，预期 FAIL。
- [ ] 群体阶段显式 reducer：酝酿可到招募/交涉/独自停工；招募可到交涉/停工；交涉可到停工/缓解；停工可到交涉/缓解；缓解兑现后结束、失约回交涉或停工。无参与者且发起人退出则结束，仍有参与者可选其认可的新发言人。
- [ ] 招募接入现有导航目标，抵达可听范围后创建邀请交流事件，再触发受邀者独立策略；暂不可达等待 15 模拟秒后取消该次邀请，保留事实记录及冷却。使用任务取消契约避免永久覆盖正常导航。
- [ ] 成员可因自救暂离位置而不退出诉求，可自主明确退出；不同诉求仅显式关联。落地每阶段快照、关系变化与经历追加的原子保存。
- [ ] 重跑两项新测试及 `npm run test -- tests/world-navigation.test.ts tests/social.test.ts`，预期 PASS。

## Task 11：集体交涉与实际兑现

**Create:** `src/games/camp/npc/collective-promises.ts`, `tests/npc-collective-negotiation.test.ts`。
**Modify:** `src/games/camp/npc/player-intents.ts`, `simulation/social.ts`, `npc/phrases.ts`, `dialogue/context.ts`。

- [ ] 写测试：玩家答应休息未恢复不能结束冲突；实际吃饭/休息/减少工作负担才履约；同道歉不能反复加信任；继续催促增加真实拒绝阶段。运行 `npm run test -- tests/npc-collective-negotiation.test.ts`，预期 FAIL。
- [ ] 复用当前 meal/rest 承诺：以实际进食完成和实际休息恢复作为兑现事件。分工调整另记任务调整承诺，以新安排实际执行且观察窗口内负担下降确认，默认窗口 30 模拟秒；仅改命令不算兑现。
- [ ] 承诺设明确截止、pending/kept/broken/cancelled；群体缓解由每人的诉求恢复与独立退出决定，不能领主一句“解决了”强制全员和解。
- [ ] 重跑新测试和 `npm run test -- tests/social.test.ts tests/late-recall.test.ts`，预期 PASS。

## Task 12：桌面状态、记忆与设置入口

**Create:** `src/components/NpcMemoryPanel.tsx`, `CollectiveStatus.tsx`, `src/styles/npc-memory.css`, `tests/npc-memory-presentation.test.ts`。
**Modify:** `src/components/PartnerSocialProfile.tsx`, `SocialDialog.tsx`, `WorldChannel.tsx`, `GameSettingsDialog.tsx`, `src/integrations/world/types.ts`, `client.ts`, `scripts/world/server.ts`, `runtime.ts`。

- [ ] 用前端 skill 检查已有组件模式，写测试覆盖事实/主观看法标签、公开/私人渠道、只读历史分页、真实模型来源。运行 `npm run test -- tests/npc-memory-presentation.test.ts`，预期 FAIL。
- [ ] 世界 API 添加服务端鉴权的记忆分页读取及 agency 设置；客户端不能指定任意玩家查询。分页 cursor 绑定当前代次和分支，重置后旧 cursor 失效；当前资料展示有界工作集，完整历史按需加载。
- [ ] 展示身体状态、模型总结/降级标识、主要诉求、相关记忆、意图和集体进程；沿用既有对话操作。world channel 仅展示已实际传达的公开交流。
- [ ] 认知开关和后端选择复用已有模型元数据；社会自主功能开关与认知开关分开。测试关闭认知保留真实群体，关闭社会自主撤销执行覆盖、重新开启不重复邀请/奖励。
- [ ] 重跑呈现测试、`npm run check:npc` 和 `npm run build`，预期 PASS。

## Task 13：完整链路、数据库演练与桌面验收

**Create:** `tests/npc-agency-end-to-end.test.ts`, `tests/npc-agency-toggle.test.ts`, `scripts/evaluate-agency.ts`, `e2e/npc-memory-agency.spec.ts`。
**Modify:** `docs/validation-npc-memory-agency.md`, `README.md`。

- [ ] 先写受控 provider 完整链路测试：真实劳动→诉求→反复拒绝→记忆检索→结构化认知接纳→概率意图→面对面邀请→独立加入/拒绝→实际停工→兑现→缓解。运行 `npm run test -- tests/npc-agency-end-to-end.test.ts tests/npc-agency-toggle.test.ts`，先确认测试能捕捉缺失闭环，再补齐实现直至 PASS。
- [ ] 评估固定种子和不同性格组合，输出协商/拒工/加入率、恢复率、无故冲突率、决策耗时。预期均为 0..1 且同输入可重放；公平正常场景不应系统性进入停工，重复失约场景的停工倾向高于正常场景。
- [ ] 临时数据库执行迁移→模拟推进→重启→损坏最新快照→回退→分叉→重置，验证水位、代次、配对密钥保留和不可跨玩家读取。真实数据库迁移前做一致备份，演练恢复后再接入。
- [ ] 使用 browser 技能打开桌面应用验证三类交流、记忆、关闭页面再恢复、群体交涉、停工实际动作及待遇改善。若运行 Playwright 配置，先核对其 preview/世界服务实际链路，确保操作进入持久世界；使用临时数据目录和独立端口，不能重置用户现有世界。
- [ ] 在已配置且用户启用的认知后端上验证一次真实闭环；无可用后端则明确标记未验证，不能用受控响应替代真实模型成功。观察网络/接纳记录/执行结果三项证据，不输出请求中的密钥。
- [ ] 执行 `npm run check:npc`、`npm run build`、`npm run test -- tests/npc-memory.test.ts tests/npc-memory-store.test.ts tests/npc-memory-recovery.test.ts tests/npc-experience-integration.test.ts tests/npc-memory-retrieval.test.ts tests/npc-appraisal-protocol.test.ts tests/npc-appraisal-scheduler.test.ts tests/npc-appraisal-replay.test.ts tests/npc-intent-policy.test.ts tests/npc-strike-survival.test.ts tests/npc-collectives.test.ts tests/npc-recruitment.test.ts tests/npc-collective-negotiation.test.ts tests/npc-agency-end-to-end.test.ts tests/npc-agency-toggle.test.ts tests/npc-memory-presentation.test.ts`，预期 PASS。
- [ ] 最后运行一次 `npm test`，对照 Task 1 基线区分新增失败与既有超时，不用无限重试掩盖问题。记录浏览器证据、真实模型验证范围、数据库增长、基线和最终模拟 p95 耗时；当前人数下 p95 批次耗时增幅目标 ≤20%，超出则先定位同步 I/O 和无界扫描。
- [ ] 更新运行与回滚文档：功能开关回退保留新数据；旧程序回退必须恢复迁移前数据库和配对密钥。提交前只审查/提交本任务差异，并按 verification-before-completion 报告事实。

## 各任务提交检查点

每个 Task 完成后审查本任务精确差异、中文可读性及对应验证输出，再提交该 Task 的新增文件和已分离的差异片段。提交主题依次使用 `feat(npc-memory)`、`feat(npc-appraisal)`、`feat(npc-agency)`、`feat(npc-collective)`、`test(npc-agency)` 等；不得将工作区其余既有改动一起提交。存在无法分离的共享修改时保留本地差异并记录原因，不能为完成检查点破坏原工作。

## 执行方式

详细规格已经确认，无需再次确认功能范围。计划审查通过后，在当前会话按 executing-plans 顺序推进，优先完成 Task 1–4 并报告持久化验证，再接入认知和社会行为；检查点用于报告结果，不自动新增批准门槛。若用户明确选择子代理执行，再改用 subagent-driven-development。
