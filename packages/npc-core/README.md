# 通用 NPC 心智核心

这是纯 TypeScript 源码包，不导入游戏、React、DOM、Node 或语言模型。公开入口是 `src/index.ts`；复制本目录或配置源码包工作区即可在下个游戏复用。`package.json` 导出的是 `.ts` 源码，接入方需要 TypeScript 构建器或支持 TypeScript 的运行环境，并非已经发布的裸 JavaScript 包。独立检查：`npx tsc -p packages/npc-core/tsconfig.json`。

## 宿主需要提供的四件事

1. `NpcProfile`：稳定 ID 与九个 `0..1` 性格参数。
2. `MindObservation`：模拟时间、身体需要、负担、不公平、指挥者信任，以及人物实际知道的同伴状况。
3. `ActionOffer[]`：宿主已经确认合法的动作；动作 ID 可为任意游戏字符串。
4. `MindEvent`：亲历事件及单调递增序号。调用 `receiveEvent` 后只应用一次返回的归一化信任/士气增量。

`createMind` 创建可序列化状态，`updateMind` 更新持续诉求，`decideBehavior` 返回动作 ID、意图、表达计划和投入比例。`decideBehavior` 内部也调用 `updateMind`，同一模拟时间重复更新不会重复衰减。宿主拥有传入状态；如使用不可变架构，请在调用前复制心智。核心不会自行复制世界或写入资源。

## 必须保留的约定

- 时间单位为模拟秒，不能混用真实时钟。伪随机种子保存在心智中，因此 JSON 保存后仍可确定性回放。
- `receiveEvent` 的 `sequence` 严格递增。清理旧记忆不会清理最高序号；倒序与重复事件不产生变化。核心不会恢复被宿主遗漏的事件。
- 信任属于宿主；核心只输入 `trustInAuthority` 和返回 `trustDelta`。百分制游戏应用增量时乘 100。
- 诉求获准不等于已经满足。实际需要降低到恢复阈值后才能关闭，拒绝次数在同一轮诉求中保留。
- 工作投入必须由宿主接入真实执行，例如 `progress += dt * decision.effort`。只改变台词而不接入执行不会产生偷懒后果。
- `expression.allowDeception` 只允许人物掩饰私人动机。是否交货、是否上菜等客观完成事实仍只能由宿主执行器确认。
- 语言层可按 `mind.revision` / `expression.revision` 废弃过期回复。每帧衰减不会刷新语义版本。
- `isValidMindState` 严格验证当前心智版本；宿主负责旧版本迁移和未来版本的保存策略。

完整的第二游戏适配位于 `examples/restaurant/index.ts`。它只使用同一个核心，将动作映射为备餐、上菜、休息，并在执行时再次检查餐品库存。

## 边界

性格是可调的游戏参数，不是 MBTI 类型或现实心理诊断。核心采用可解释的效用评分与状态规则；没有把自由文本理解或世界模拟包装成通用智能。集体拒工需要双方各自的不满与可知信息，单个 NPC 的怒气不会直接控制全体。
