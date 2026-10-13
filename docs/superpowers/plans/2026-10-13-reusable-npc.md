# 可复用 NPC 系统实施计划

## Goal
完成可复用心智/表达模块、营地适配、老周与林枫行为升级，并验证旧存档与现有玩法。

## Architecture
通用纯 TypeScript 包只消费宿主观察和事件、返回行为意图；营地拥有真实世界执行和持久化；MiniMind 是可替换的语言后端。

## Tech Stack
TypeScript 5.9、现有 React/Vite/Three.js、Vitest、Playwright；不增加运行时框架依赖。

## Spec
`docs/superpowers/specs/2026-10-13-reusable-npc-design.md`

## Global Constraints
- 保持 41/8/5 的 MLP 接口；保留稳定人物 ID；事件游标独立于可裁剪记忆。
- 通用包零营地/DOM/React 依赖；游戏时间由宿主注入；真实结果由执行层产生。
- 新增行为与关键扩展点带详细中文注释。已有紧凑界面不做无关重排。
- 并行任务分配不重叠的文件；依赖类型以核心公开契约为准，集成时检查实际实现。

## Review Focus
自主行动是否真正执行；旧命令/拖动是否绕过；拒绝是否每帧重复；语言是否覆盖已改变状态；旧存档是否被错误删除；通用包是否偷偷依赖营地；谎言是否污染资源。

## Task 1：整理目录与建立基线
- [x] 将 `src/game/*` 移入 `src/games/camp/simulation/`，营地策略移入 `src/games/camp/ai/`，校验工具移入 `src/shared/crypto/`，更新源码/测试/脚本导入。
- [x] `npm ci --ignore-scripts --no-audit --no-fund`，运行已有 `npm test` 和 TypeScript 检查，记录基线问题。

## Task 2：通用心智核心
- [x] 在 `packages/npc-core/src/{types,runtime,validation,index}.ts` 实现约定 API；可按职责拆分文件。
- [x] 先添加有意义的行为测试：同一拒绝事件幂等、不同性格选择、持续诉求恢复、最低意图时长、同伴独立选择、有意掩饰与真实行动分离。
- [x] 新增 `examples/restaurant/` 和 `tests/npc-core.test.ts`，验证无营地依赖的复用与 JSON 保存回放。
- [x] 运行 `npx vitest run tests/npc-core.test.ts` 与纯包独立类型检查。

## Task 3：营地人物与执行适配
- [x] `src/games/camp/npc/{profiles,bridge,phrases,player-intents}.ts` 实现配置、观察、行动候选、事件输入和表达。
- [x] 更新 `simulation/{types,constants,personalities,engine,social,social-types}.ts`：持续诉求、明确拒绝选项、实际低投入/休息、命令仲裁、同伴抗议与日志。
- [x] 新增 `tests/npc-camp.test.ts` 复现反复拒绝、林枫偷懒、老周掩饰、按钮与文字入口一致、多人响应与身体/搬运优先。
- [x] 运行相关 engine/social/physics/late-recall 测试；更新确已改变的旧友善设定断言，保留资源与执行约束。

## Task 4：可复用对话与浏览器后端
- [x] 抽取 `packages/npc-dialogue/src/`，以宿主桥接和注入后端实现通用调度/表达；无营地对象和浏览器 SDK。
- [x] MiniMind 移入 `src/integrations/minimind/`；保持一个 runtime 单例和有效 worker 相对 URL。
- [x] 营地上下文、提交校验、服务置于 `src/games/camp/dialogue/`，接入表达计划、近期历史与心智修订。
- [x] 更新 `tests/{dialogue,minimind,minimind-runtime}.test.ts` 和新增通用对话测试，覆盖过期结果、取消/重试、掩饰边界与无模型回退。

## Task 5：存档、界面与交付验证
- [x] `simulation/persistence.ts` 先测旧三人/五人迁移与新心智严格校验，再实现迁移；不能把未知未来版本作为坏档删除。
- [x] `PartnerSocialProfile.tsx`/`SocialDialog.tsx` 展示必要的立场、情绪和行为后果；不把调试参数堆给普通玩家。
- [x] 增加独立包边界检查命令，更新 README 的目录与复用教程。
- [x] 运行 `npm test`、纯包检查、`npm run build`，必要的针对性 Playwright 验证；记录真实模型运行是否已验证。
- [x] 根据文件 diff 和测试证据审查需求覆盖，修复实质问题，提交并推送可审阅分支。

## 实施记录
- 机械迁移后的原有 321 个测试通过，随后才接入新心智，避免把重构与玩法问题混为一谈。
- 两个通用模块是独立 ES2022/noDOM 的 TypeScript 源码包；新增零反向依赖检查并接入 CI。
- 餐厅示例直接复用核心，验证了世界执行、库存保护和 JSON 恢复后确定性回放。
- 末段安全集合保持既有胜利流程，但不清除停工立场；实际休息位置调整解决通路阻挡。
- 独立审查补充并修复异步取消、多句提交、角色离场清理、重复道歉、组合信任奖励、治疗归因及低勤奋人物条件合作问题。
- 治疗执行在原有 3.5 范围内、静态路径可达时站定积累真实进度，解决自动避人导致无法抵达固定偏移点的问题。
- 真实模型检查中发现新增上下文超过 8 秒推理预算，去重与有界提示词修复后，真实生成和离线恢复均通过；没有放宽事实和立场校验。
- 最终 383 项单元测试通过，24 个浏览器用例覆盖通过（包括更新后的旧 HUD 用例补跑），14 局实际引擎仿真完成且来源指纹与交付代码一致。
- 最终命令、测试数量、浏览器结果和实用边界统一记入 `docs/validation-npc.md`。
