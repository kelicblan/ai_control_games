# CampMind：Unity + URP 原生迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本文是主计划；实施前按里程碑细化执行任务。默认在当前任务逐项执行，未经用户授权不委派实施代理。

**Goal:** 将当前 CampMind 迁移为可在 Steam 发布的 Windows 原生游戏，同时形成可用于后续游戏的 C# 游戏基础框架。

**Architecture:** Unity 负责呈现、输入和桌面生命周期；独立 C# 核心负责世界、NPC 和游戏规则；SQLite 负责持久化；独立 AI 进程提供推理能力。先用现有 TypeScript 世界服务支撑原生样板，验证画质、性能和交付，再逐步替换为 C# 权威核心，最后移除产品对浏览器、React、Three.js 和 Node 世界服务的依赖。

**Tech Stack:** Unity 6.3 LTS、匹配版本 URP、C#、Input System、uGUI/TextMeshPro、SQLite、Windows x64 IL2CPP、Steamworks；保留现有模型资源与 AI 推理能力。

---

## 1. 决策、范围与事实边界

日期：2026-10-16。状态：**M0兼容性基础已验证；M1真实场景与M2隔离TS权威样板进行中；G1/G2及完整迁移尚未通过。** 最新进度与证据见 `docs/unity-migration/progress.md`、`native-slice-report.md`。

主方案是“原生客户端 + 独立规则核心 + AI 适配层”，不是将网页装进桌面壳。首发范围为 Windows 10/11 x64、键鼠、单机持续世界；Steam Deck、Linux、macOS、联网多人、创意工坊不作为本次迁移的阻塞目标。未来通过平台接口扩展，不提前实现。

本计划迁移已经实现的玩法。`docs/2026-10-16-llm-social-architecture-design.md` 中尚未实现的愿景必须单独标记，不能混入迁移等价性范围。现有缺陷也要单独登记，不能把缺陷当作必须复刻的规则。

前次实测显示真实主页长预热后约 30.3 / 38.7 FPS，P95 帧间隔约 50ms，实际缓冲区为 1162×654；存在天气 CPU 开销、渲染负载和世界修订冲突。固定场景结果受预热及顺序影响明显。**这些数据支持重建性能基线，不证明 Unity 已快多少。** 证据见 [性能评估](../../steam-performance-2026-10-16/assessment.md)。

版本选择：以 Unity 6.3 LTS 作为迁移冻结版本系列，具体补丁在 M0 完成兼容性验证后锁定。官方当前列出其支持期至 2027 年 12 月；这不是“LTS 天然比 Update 更快”的判断。[Unity 支持政策](https://unity.com/releases/unity-6/support)

最终“原生完成”的定义：安装包在未安装浏览器开发环境、Node、Python、Unity Editor 的干净电脑上运行；游戏逻辑与 UI 不依赖 WebView；AI 可作为随包交付的独立原生进程，网络不可用时基础游戏仍可继续。

## 2. 不可丢失的项目能力

| 当前能力 / 来源 | 迁移方式 | 等价验收 |
| --- | --- | --- |
| `src/games/camp/simulation/engine.ts`、`survival.ts`、`lifecycle.ts` | 规则逐项迁至 Camp C# 程序集 | 同种子、输入、时钟的事件与关键状态对照；生存优先、人口相关食物储备 |
| `lord.ts`、`lordCharacter.ts`、`lordInput.ts`、相机记忆 | 原生输入、动画、双视角；规则与表现分离 | 保留领主身份与操作、NPC死亡后世界延续、切换视角、镜头和碰撞；领主死亡/继承尚未实现，另立功能 |
| `packages/npc-core`、`src/games/camp/npc` | 通用 NPC 内核与 Camp 行为插件分开移植 | 稳定身份、人格、合法行动、意图、集体与招募语义保持 |
| `packages/npc-dialogue`、社会系统 | 结构化协议与导演逻辑移植，AI 后端复用 | 对话源于真实工作/事件；知识边界；无新信息允许沉默 |
| `public/models/policy.f32`、`manifest.json`、`parity-fixtures.json` | C# 实现已有 MLP 推理与特征处理 | 权重、归一化、动作掩码、输出数值容差及最终行动逐例对照 |
| `scripts/world/store.ts`、记忆与对话存储 | C# SQLite 适配器与一次性导入器 | 快照、记忆、会话、代际/分支/水位一起迁移；损坏回退与幂等 |
| `scripts/native-models`、模型管理、MiniMind | 推理能力适配；浏览器 WASM Worker 不直接搬入 Unity | 用户选择优先，MiniMind3 兜底，最后代码保障游戏推进；来源显示准确 |
| `public/assets/models`、地形/生态/建筑 | 原资源离线导入、材质转换与 LOD | 地形高度、河流、桥、门洞、树木、角色骨骼动画与可通行区域一致 |
| React 面板、地图、NPC 标签、音频 | Unity 原生 UI / 音频重建 | 已有交互清单逐项验收；中文字体、缩放、列表性能和声音事件 |

“复用资源”不等于零成本：GLB 的贴图、骨骼、动画、坐标、材质均需检查；React/Three.js 实现不能直接成为 Unity 组件。

## 3. 目标架构与依赖规则

```text
CampMind Unity 客户端
  ├─ 输入 / 相机 / UI / 音频 / URP 表现
  └─ GameHost（命令队列、时钟、生命周期）
       ├─ Camp 游戏模块（本游戏规则与配置）
       ├─ Framework.Core（ID、时钟、命令、事件、确定性随机）
       ├─ Framework.World / Framework.Npc（通用能力）
       ├─ Persistence → SQLite
       ├─ AI Gateway → 本地推理进程 / 可选远程模型
       └─ Platform → 本地身份 / Steamworks
```

- 核心程序集不引用 `UnityEngine`、场景对象、Steam API、HTTP 或 SQLite；通过宿主接口提供存储、时间、导航和推理。
- Camp 专有的食物、营地、领主、招募规则留在 Camp 模块，禁止让框架引用 `CampGameState` 或固定 `NPC_IDS`。
- 表现层接收只读状态和事件，通过命令改变世界；禁止 Animator、UI 或 AI 回复直接修改库存、任务和记忆。
- 一个会话只有一个权威写入者。M2 是 TS 服务；M3 影子 C# 只比较；M4 切换后是 C#，旧服务停止写入。
- 先保留现有 100ms 世界规则步长；输入采集与显示逐帧进行。角色局部反馈可预测，但权威位置由唯一运动系统决定。若需要改为高频移动，另设规则版本与验收，不能暗中改变时间步长破坏等价性。
- 第一版不全面引入 DOTS/ECS，不先做通用编辑器、多人框架或脚本语言。先通过第二个小型游戏证明复用边界。

### 建议新增目录（均为计划创建）

```text
native/
  CampMind.Unity/
    Assets/CampMind/{Bootstrap,Presentation,UI,Content,Scenes,Tests,Editor}/
    Packages/{manifest.json,packages-lock.json}
    ProjectSettings/ProjectVersion.txt
  Packages/
    com.campmind.foundation/{Runtime,Tests,package.json}
    com.campmind.world/{Runtime,Tests,package.json}
    com.campmind.npc/{Runtime,Tests,package.json}
    com.campmind.persistence/{Runtime,Tests,package.json}
    com.campmind.ai/{Runtime,Tests,package.json}
    com.campmind.platform/{Runtime,Tests,package.json}
    com.campmind.game.camp/{Runtime,Tests,package.json}
  Tools/{FixtureExporter,SaveMigrator}/
  ReuseProbe.Unity/
contracts/migration/{protocol.schema.json,feature-manifest.json,fixtures/}
scripts/unity/{test.ps1,build.ps1,benchmark.ps1}
docs/unity-migration/{baseline.md,dependency-lock.md,asset-manifest.csv,acceptance.md}
```

UPM 使用本地包路径，提交 `.meta` 和锁文件；不提交 `Library/Temp/Logs`、本机凭据或模型缓存。大型源资源采用团队实际可用的 Git LFS 或已有资产存储，确保 CI 能恢复相同版本。核心使用 Unity 支持的 .NET Standard 2.1 API 子集，程序集设置 `noEngineReferences`；不能直接引用只支持 .NET 8 的库。[Unity API 兼容性](https://docs.unity3d.com/6000.3/Documentation/Manual/dotnet-profile-support.html)

## 4. 实施顺序与投入估算

人日为初始规划区间，不是交付承诺。假设现有模型可合法复用，功能范围以 M0 清单冻结，不同时新增大型玩法。负责人是角色，不预设实际人员配置。

| 阶段 | 工作与可验收产物 | 依赖 | 主负责人 | 估算人日 |
| --- | --- | --- | --- | ---: |
| M0 基线冻结 | 功能/缺陷清单、回放数据、资源清单、兼容性烟测 | 无 | 核心工程师 + QA | 3–5 |
| M1 原生基础 | 可打包项目、真实资产、双视角、输入、渲染基线 | M0 | Unity 工程师 + 技术美术 | 5–8 |
| M2 原生纵向样板 | Unity 接 TS 权威世界，可玩 15 分钟、原生性能报告 | M1 | Unity + 核心工程师 | 5–8 |
| M3 C# 世界与 NPC | 核心包、规则回放、MLP 等价、影子对照 | M2 通过 | 核心工程师 | 10–18 |
| M4 存档与 AI 切换 | 全量旧档导入、原生 AI、单一 C# 权威、离线运行 | M3 | 核心工程师 | 8–14 |
| M5 功能完整 | 原生 UI、社会交互、音频、设置、全部迁移清单通过 | M3；最终验收依赖 M4 | Unity 工程师 + QA | 8–12 |
| M6 Steam 发布候选 | 安装包、Steam 集成、性能与长稳、恢复演练 | M4 + M5 | Unity 工程师 + QA | 7–12 |
| M7 框架复用验收 | 第二个极小示例游戏、模板、开发文档 | M6 | 核心 + Unity 工程师 | 3–5 |
| **合计** | 不含 Steam 平台审核等待 | | | **49–82** |

建议额外预留约 25% 风险缓冲，整体约 **61–103 人日**。单人约 3–5 个月量级；两名互补工程师加兼职技术美术/QA，初排约 8–12 周，但串行门禁和人员熟悉度可能延长。M2 结束依据真实产能与问题清单重新估算。最早约 13–21 人日应得到是否继续全面迁移的证据。

### M0：冻结迁移基线

**读取：** 当前 `package.json`、`src/games/camp`、`packages`、`scripts/world`、`tests`；前次性能报告。**新增：** `docs/unity-migration/baseline.md`、`contracts/migration/feature-manifest.json`、`docs/unity-migration/asset-manifest.csv`、`scripts/export-unity-fixtures.ts`、`tests/unity-fixture-export.test.ts`。

- [x] 按源码和运行基线列出功能，标记“已实现 / 有缺陷 / 仅设计 / 本次排除”，指定现有测试与原生验收场景；见feature-manifest.json。
- [x] 在隔离目录备份测试数据库及元数据，记录 Git 提交、依赖锁、模型哈希和既有硬件基线；未对真实玩家档进行破坏性实验。
- [x] 执行构建与全量测试，保存退出码与失败列表；见baseline.md和baseline-failures.json，现有失败没有被宣称修复。
- [x] 夹具导出器先失败后通过，覆盖固定种子、随机状态、输入日志、时间推进、关键事件与保存重载。
- [x] 输出8套场景：新世界、食物短缺、NPC死亡后持续世界、社会工作、天气、重启续玩、旧档恢复、过期AI结果；未实现的领主继承不纳入等价性。
- [ ] 验证 Unity 6.3 补丁、URP、Input System、SQLite 插件、序列化方案、GLB 导入与 AI 运行库组合；在最小 Win64 IL2CPP 包验证 SQLite 写入/重开和 DTO 序列化，提前发现 AOT/裁剪问题。
- [x] MiniMind3实际GGUF权重的Windows原生加载、受约束生成、取消与退出烟测通过；格式/运行库见dependency-lock.md。M4仍需完成Unity宿主与失败恢复集成，许可证核对保留在下项。
- [ ] 记录 Windows 构建工具与 Unity 许可需求、包许可证及资源授权；锁定版本，不依赖每次安装“最新版”。

**门禁 G0：** 夹具可重复生成；现有功能/缺陷可区分；最小 IL2CPP 数据通路与 MiniMind3 原生烟测可运行；不确定依赖有明确验证结果。任何阻塞都进入问题单再排期。

### M1：Unity 工程、资源和渲染基础

**新增：** `native/CampMind.Unity`；`Assets/CampMind/Scenes/{Bootstrap,Camp}.unity`、`Editor/BuildEntry.cs`、`Presentation/{CameraRig,CharacterView,WeatherView}.cs`、`Editor/AssetAudit.cs`；脚本 `scripts/unity/{test,build}.ps1`。

- [ ] 创建 URP 工程、程序集边界、启动场景和构建入口；Windows x64 IL2CPP 的空场景可独立启动退出。
- [ ] 通过 glTF 导入工具在编辑期转换实际地形、树木、茅屋、领主和 NPC；保存原资产哈希、转换参数与 Prefab 对照。glTFast 支持编辑器导入，但实际兼容版本必须通过 G0。[官方导入说明](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.0/manual/ImportEditor.html)
- [ ] 检查单位、轴向、UV、法线、PBR 贴图通道、透明与双面、骨骼和动作；用真实角色走动验收，不能以胶囊替身通过最终样板。
- [ ] 建立 LOD、共享材质、纹理压缩和资源缓存。首选 URP Forward + DX11 建基线，SRP Batcher/实例化按材质兼容验证；Forward+ 等优化单独测，不默认叠加。
- [ ] 重建上帝/领主视角、遮挡处理、视角切换和镜头存储；键鼠输入使用 Input System，焦点丢失时释放按键。
- [ ] 天气用粒子系统/批量更新，屋顶遮雨采用空间区域或低频查询；不照搬逐粒子每帧复杂射线。保留暴雨、风、雷电和昼夜效果。
- [ ] 静态环境与动态角色区分阴影预算；不能通过烘焙固定太阳删掉动态昼夜。建立高/中/低预设及截图画质验收。
- [ ] 地形逻辑二维坐标 `{x,y}` 映射 Unity `(x,height,y)`；验证河流、桥、门洞与逻辑导航，记录比例与原点。大世界权威坐标与视觉浮动原点分离。

**门禁 G1：** 原生包呈现实际完整营地、9 个动画角色、两种相机和天气；导入报告无关键丢失；无浏览器依赖。静态 FPS 只用于发现渲染问题，不代表游戏已迁移完成。

### M2：可玩纵向样板与继续迁移门禁

**新增：** `com.campmind.foundation/Runtime/{CommandEnvelope,WorldVersion}.cs`；`Assets/CampMind/Bootstrap/TsWorldBridge.cs`、`Presentation/WorldPresenter.cs`、`UI/SliceHud.cs`；`contracts/migration/protocol.schema.json`；`scripts/unity/benchmark.ps1`。

- [ ] 明确定义命令 ID、玩家/会话 ID、schemaVersion、generation、branch、revision、tick、事件水位和结构化错误；在 TS 与 C# 两侧验证相同协议夹具。
- [ ] 连接**专用测试端口和独立数据库**的现有世界服务，实现启动、读档、推进、领主操作和状态显示。原始服务继续负责权威，不让 Unity 再推进一份世界。
- [ ] 建立输入即时反馈与权威校正；桥接阶段明确保留的 HTTP/快照开销，避免声称已经解决最终输入延迟。
- [ ] 覆盖步行、采集、进食、工作、日夜、暴雨、视角切换、保存重载；模拟断连、409、重复命令，确保不重复扣资源、不自动覆盖新修订。
- [ ] 完成至少一次基于真实工作的 NPC 对话：实际模型请求、权威验证、数据库确认、Unity 显示及来源标识全部贯通；性能回放另用固定响应，避免混淆 AI 非确定性。
- [ ] 执行第 6 节基准：纯渲染回放和带 TS 服务可玩样板分别测，导出原始 CSV、Profiler 证据、视频/截图和完整配置。
- [ ] 输出 `docs/unity-migration/native-slice-report.md`，列出 CPU/GPU/内存/加载/操作延迟及已保留的桥接瓶颈，更新工期。

**门禁 G2：** 画质与规则样板完整、15 分钟无致命错误；原生渲染回放达到目标预算，可玩样板不存在无法解释的持续卡顿。若只有去掉森林、天气或大幅降清晰度才能达标，G2 不通过。允许有明确测量与替换计划的 TS 桥接开销，但不能把它计作最终原生达标。未通过时先缩小问题并复测，暂缓全面 C# 重写投入。

### M3：C# 世界、NPC 与策略等价

**新增：** foundation 的 `Runtime/{WorldClock,DeterministicRandom,CommandQueue}.cs`；world 的 `Runtime/{Navigation,WorldEvent}.cs`；npc 的 `Runtime/{NpcRuntime,IntentPolicy,MemoryRetrieval}.cs`；game.camp 的 `Runtime/{CampState,CampSimulation,Survival,LordLifecycle,SocialRules,PolicyInference}.cs`；各包对应 `Tests/*Tests.cs`；`native/Tools/FixtureExporter`。

- [ ] 逐个移植状态类型与校验规则；序列化固定稳定 ID，不保存 Unity 对象引用。未知 schema 拒绝读取，错误可诊断。
- [ ] 移植随机算法与状态、时间推进、事件排序；先跑夹具差异失败，再实现最小规则。JSON 属性顺序不同不算语义差异；整数、ID、事件顺序严格一致，浮点容差按字段明确并记录。
- [ ] 先迁移世界/生存，再领主生命周期，再 NPC 决策/记忆，最后社会与集体。每一批都运行对应旧测试语义及 C# 回放。
- [ ] 实现当前 MLP 权重读取、特征归一化、激活函数与合法动作掩码；使用已有 `parity-fixtures.json` 对照，不能用新规则代替训练策略却宣称迁移成功。
- [ ] 导航与碰撞只有一个权威来源；需要 Unity 查询时通过宿主接口批量提供，不在纯核心里调用 PhysX。动画关闭权威 root motion，禁止与规则移动双重驱动。
- [ ] C# 影子运行只接收相同命令/时间/固定 AI 结果，不写玩家存档；输出首次分歧 tick、字段路径、前后状态和事件。
- [ ] 验证暂停、倍速、长时间推进、窗口失焦、进程重启、系统时钟回拨和离线追赶上限。保留“玩家/领主死亡不结束世界”，不照搬过期文档的固定时长结束机制。

**门禁 G3：** 所有已冻结核心夹具通过，差异要么为缺陷修复且有独立批准的规则变更记录，要么阻塞切换；纯核心无 Unity/Camp 反向依赖；TS 仍是正式权威。

### M4：存档、模型运行时与权威切换

**新增：** persistence 的 `Runtime/{SqliteSnapshotStore,MemoryStore,SaveRecovery}.cs`；ai 的 `Runtime/{AiGateway,ModelRouter,InferenceProcessHost,ResultValidator}.cs`；`native/Tools/SaveMigrator`；`Assets/CampMind/Bootstrap/NativeGameHost.cs`；相应持久化/模型契约测试。

- [ ] 先编写保存重开、写中崩溃、损坏快照、未知版本、重复命令、记忆分支恢复测试，再实现事务和恢复策略；IL2CPP Player 也跑 SQLite 烟测。
- [ ] 将旧 SQLite 的快照、操作幂等记录、NPC 经验/评价/摘要、对话历史、generation/branch/watermark 一起导出；核对现有所有表，再固定导出清单。
- [ ] 校验旧快照原始 JSON 字节的 SHA256，再转换类型；不能重排 JSON 后拿新哈希验证旧记录。导入新 schema 后单独建立新校验值与溯源记录。
- [ ] 在独立目录执行事务导入，验证行数、引用、最新世界状态与关键剧情；重开通过后才原子切换活动存档指针。源档始终保留。
- [ ] 移植本地模型进程启动、健康检查、取消、超时、并发限制、退出清理；协议包含请求 ID、世界代际与证据水位。旧世界/旧分支/重复结果拒绝提交。
- [ ] 在 Windows 原生后端验证 MiniMind3 模型格式和运行库可用性；浏览器 WASM/Worker 不是可直接复用的运行时。若需格式转换，固定工具/哈希并做输出与许可检查；不可悄悄去掉 MiniMind3 兜底。
- [ ] 保留“用户指定本地/远程模型优先 → MiniMind3 → 代码保障”的路由；对话来源、行动来源分别记录。对话不能直接修改资源；通过权威验证、事务确认后才发布与持久化。
- [ ] AI 的密钥与用户模型目录置于独立本机配置；不进入回放夹具、日志或 Steam Cloud；基础游戏无需远程账号即可运行。
- [ ] 完成离线新建、旧档迁移、退出/重开、AI 崩溃重启与网络不可用测试后，停止该会话 TS 写入，切换至 C#。回退步骤按第 7 节执行。
- [ ] 最终客户端通过进程内只读状态视图与增量事件更新表现，移除 TS 桥接的 HTTP 全量快照轮询；跨线程时使用明确的不可变快照/队列，在 Unity 主线程消费表现事件。AI IPC 不承担世界全量同步。

**门禁 G4：** 无 Node 世界服务也能完整续玩；原生模型链路实际验证；迁移与崩溃恢复演练通过；不存在双写。窗口退出时有序关子进程，持续世界通过明确的离线推进规则延续，不依赖遗留后台进程偷偷运行。

### M5：原生 UI 与功能闭环

**新增：** `Assets/CampMind/UI/{Hud,NpcPanel,DialoguePanel,ModelSettings,SavePanel,WorldMap,SettingsPanel}.cs`、相关 Prefab、中文字体与音频配置；`Assets/CampMind/Tests/PlayMode/FeatureParityTests.cs`。

- [ ] 按 M0 功能清单逐项迁移面板和操作；uGUI/TextMeshPro 为默认选型，避免迁移中混用多套 UI 框架。
- [ ] 复刻必要信息层级与操作语义，适配 1080p/1440p/4K 和窗口缩放；中文字体回退、长文本、焦点与弹窗遮挡正确。
- [ ] NPC 标签、对话历史和列表使用池化/虚拟化；UI 按状态变化更新，不每帧重建整棵面板。
- [ ] 完成社会收件箱、承诺/约定、招募/集体、记忆展示、模型选择与来源提示；按当前已实现范围验收。
- [ ] 音乐、环境音、脚步、天气声与事件绑定；切换场景、暂停和重载不重复播放、不泄漏资源。
- [ ] 重新验收生存、领主死亡、世界延续、读档、模型失效、社会竞态；测试结果附映射到旧测试文件，证明覆盖的是同一规则。

**门禁 G5：** 功能清单全部通过或有明确排除记录；完整游戏无需浏览器 UI；不能把“能走动的场景”算完成迁移。

### M6：Steam、性能与发布候选

**新增：** platform 的 `Runtime/{IPlatformServices,LocalPlatformServices,SteamPlatformServices}.cs`；`Assets/CampMind/Editor/SteamBuild.cs`；`docs/unity-migration/{release-checklist,rollback-runbook}.md`。

- [ ] 封装 Steam 初始化/退出、用户身份、覆盖层与成就；Steam 不可用时保留允许的离线流程。无真实 AppID/账号权限时仅完成适配器测试，平台验收明确标记阻塞。
- [ ] 本地玩家身份与 SteamID 映射显式导入，不把多个浏览器身份自动合并。覆盖层打开/失焦时避免粘键。
- [ ] 云存档上传关闭/一致性导出的存档包，不直接同步正在写入的 SQLite/WAL；包含版本、校验、代际与清单。冲突保留双方副本，让用户选择，不能自动按文件时间覆盖。[Steam Cloud 文档](https://partner.steamgames.com/doc/features/cloud)
- [ ] Win64 IL2CPP Release 包执行第 6 节完整矩阵；Development Build 仅用于定位开销，最终数字另用 Release 采样。
- [ ] 干净机器测试安装、卸载保留存档、升级、离线启动、模型缺失、路径含中文与空格、只读安装目录、覆盖层和崩溃恢复。
- [ ] 验证分发依赖、模型授权和容量；首包能离线进入基本游戏，选装模型清楚标注下载/缓存行为。发布前排除开发用 `steam_appid.txt` 和密钥。
- [ ] 创建内部测试分支和发布候选包；真实 Steam 上传/审核/正式发布按用户后续授权执行，不能用本地测试替代平台验收。

**门禁 G6：** 性能、功能、存档和干净环境测试通过；Steam 实际运行证据齐全才称为 Steam 发布候选。平台账号/审核等待不计入工程工期承诺。

### M7：第二款游戏验证框架复用

**新增：** `native/ReuseProbe.Unity`、`native/Packages/com.campmind.game.reuseprobe`、`docs/unity-migration/framework-guide.md`。

- [ ] 创建不同规则的小型示例：单房间工作协作，不含营地资源与领主身份，但使用相同 NPC、存档、AI、输入和平台接口。
- [ ] 独立 GameId、配置、内容和存档命名空间；不复制核心包，不依赖 Camp 程序集，构建中不包含 Camp 资产。
- [ ] 完成创建世界 → 执行动作 → NPC 事件 → 保存 → 重开链路；AI 使用录制回复及可选实际后端两种模式。
- [ ] 修复暴露的 Camp 耦合，说明如何新建游戏、声明规则、增加资源、定义迁移版本和运行测试；将示例保留为框架回归用例。

**门禁 G7：** 第二款示例只新增游戏模块与表现配置即可运行；框架包没有因为新游戏而出现 `if (game == CampMind)` 分支。

## 5. 协议与数据约束

协议至少覆盖以下字段；命名可在 M0 固定，但含义不能省略：

| 对象 | 必要内容 | 规则 |
| --- | --- | --- |
| 命令 | commandId、sessionId、actorId、generation、expectedRevision、type、payload | 去重、合法性校验、冲突返回；输入命令和管理操作可采用不同修订策略，但须显式定义 |
| 状态 | schemaVersion、gameId、worldId、generation、branchId、revision、tick、rngState | 渲染只读；版本不兼容不猜测加载 |
| AI 请求/响应 | requestId、npcId、模型身份、证据水位、世界分支、超时、结构化结果 | 推理结果不是权威事实；校验并提交后才能成为事件 |
| 存档清单 | schema、创建程序版本、各文件哈希、世界身份、来源旧档标识 | 原子切换、独立备份、明确恢复提示 |

默认单机不引入跨机器锁步要求；要求的是规则回放与迁移语义可核对。Unity PhysX 结果不宣称跨平台逐位确定性。AI 真正生成的文本也不做逐字确定性要求，回放用固定响应验证提交路径。

## 6. 性能、正确性与长稳验收

### 测试方法

1. 以现有 Core Ultra 7 155H / Intel Arc 机器作为第一台基准机，固定驱动、电源模式和显示设置；另外至少一台目标最低配置机及一台主流独显机器，最低配置由 M2 数据后正式公布。
2. 新建可推进的确定性回放：相同种子、资产、9 NPC、天气时序、镜头路径、输入和世界时间；晴天/暴雨 × 上帝/领主各跑。不要使用此前被冻结表现时间的预览代替真实动态场景。
3. 1920×1080、渲染比例 1.0、同等画质；禁用动态分辨率建立基线。生产自适应画质另测，记录实际缓冲区。VSync/帧率上限分别记录，比较时一致。
4. 每场景预热 90 秒，测量至少 5 分钟，3 次独立重复；打乱场景顺序，汇总各次分位数与范围，不只取最佳一轮。另做 15 分钟全功能流程和 2 小时长稳。
5. 重新采集前台生产 Web 版本基线，与 Unity Player 在相同机器顺序运行；先前 headless 数据只作历史证据，不能直接计算最终提速倍数。
6. 记录 frame time P50/P95/P99、慢帧数、主线程/渲染线程/GPU 时间、GC 分配、CPU/GPU 内存、加载/保存时长；CPU 提交时间不等于 GPU 时间。
7. 分离渲染回放、TS 桥接样板、最终原生三组数据；AI 关闭/本地 MiniMind3/选定大模型各测，记录模型和并发。不能用 AI 关闭成绩代表完整运行。

G6 的默认性能门禁使用 G0 锁定的 MiniMind3 配置及实际社会调度负载；用户另选的大模型独立报告硬件要求和资源预算，不承诺任意模型都满足同一帧率。AI 进程限并发，并验证与渲染争抢 CPU/GPU 时的降载策略。

### 目标预算（目标，不是已测结果）

| 指标 | 基准配置下验收目标 | 超限处理 |
| --- | --- | --- |
| 9 NPC、1080p 中画质、真实天气 | 目标 60 FPS；三次均平均 ≥58 FPS，P95 ≤20ms，P99 ≤33ms | 定位 CPU/GPU/加载；不能靠删除功能通过 |
| 连续运行尖峰 | 非加载阶段 >100ms 帧不超过 1 次/5分钟；无连续卡死 | 附尖峰调用栈并修复 |
| 输入反馈 | 引擎输入事件到对应首个可见响应 P95 ≤100ms，至少100次；权威确认另报 | 输入与权威/表现路径分别测；不把自动化耗时当纯物理延迟 |
| 存档 | 常规自动保存不产生 >33ms 主线程阻塞；写入异步完成时间记录 | 快照提取/序列化/IO 分开计时 |
| 长稳 | 2小时无崩溃、无存档损坏、无无限增长；预热后同场景内存增长≤10% | 分开报告游戏和模型进程、缓存增长与泄漏 |
| 并发压力 | 30 NPC 为扩展目标，100 NPC 为容量探测 | 独立报告，不承诺100NPC必然60FPS |

M2 记录首启、暖启动、内存、包体、模型占用的实际值，并在 G2 报告中冻结 M6 上限；不能到最后才临时放宽。模型下载不计入渲染首帧，却必须独立报告耗时与失败体验。

### 正确性验收矩阵

| 类别 | 必须覆盖 |
| --- | --- |
| 规则 | 新世界、生存储备、行动合法性、MLP、灾害、时间推进、死亡与继承、连续世界 |
| 社会与记忆 | 工作上下文、知识边界、集体/招募、约定、重复与过期结果、分支恢复、提交后发布 |
| 资产/控制 | 地形/桥/门洞碰撞、坡地、模型动画、相机恢复、双视角、焦点与UI输入互斥 |
| 存档 | 空档、当前档、受支持旧档、损坏档、未知版本、写中断电、重复导入、云冲突 |
| 模型 | 指定模型可用/不可用、MiniMind3兜底、全部AI失败、超时取消、后台重启、退出清理 |
| 平台 | 干净机、Steam 在线/离线、覆盖层、升级、卸载、独立玩家身份 |

## 7. 迁移与回退操作边界

- 迁移开发使用隔离分支/工作区与独立数据目录。保留当前可玩的 Web 版本、源码提交与依赖锁；不顺便改写线上旧档。
- 旧数据库备份使用 SQLite 一致性备份，或停掉**自己管理的对应服务**并完成 WAL checkpoint 后复制；不能只复制一个仍在写入的 `.db` 文件，也不能杀所有 Node 进程。
- 切换前暂停新命令、完成/取消在途任务、持久化并核对最终水位；新世界启动使用明确的新 generation，旧请求无法补写。
- 导入失败不修改旧档。导入成功仍保留旧档与导入日志；回退旧版只能回到切换时旧档，**不能承诺迁移后新进度自动写回 TS 格式**。如需要双向回迁，另立项目，当前不实现双写。
- 发现原生重大故障：停止该会话写入、保留故障新档、切回冻结旧版与旧档，并说明回退点之后的进度边界；禁止静默丢进度。
- 平台云同步只处理一致性存档包；不同 schema 的客户端不交替覆盖同一活动文件。密钥、模型权重缓存和日志默认不上传。

## 8. 工程检查与交付要求

每阶段采用“失败用例 → 最小实现 → 通过证据 → 小提交”，不把图形截图、规则单测、打包成功和 Steam 运行混为同一项验证。

计划新增的脚本接口如下，M1 实现后使用；**这些命令目前尚不存在，不应当作已执行结果。** 所有脚本检查工具路径、超时、退出码、输出文件和测试失败数；Unity 返回 0 但无测试报告也视为失败。

```powershell
# 在仓库根目录执行；UNITY_EDITOR 指向 M0 锁定的 Unity.exe。
./scripts/unity/test.ps1 -Suite EditMode
./scripts/unity/test.ps1 -Suite PlayMode
./scripts/unity/build.ps1 -Configuration Release -Target Win64
./scripts/unity/benchmark.ps1 -Scenario all -Repeats 3 -WarmupSeconds 90 -SampleSeconds 300
```

EditMode 运行核心/存档/协议夹具；PlayMode 运行场景与交互；Player 在真实 GPU 桌面采性能。无图形 CI 可测纯逻辑，**不能用 `-nographics` 的结果签署渲染性能验收**。IL2CPP 的序列化、SQLite 和 AI 启动另在实际 Player 测，必要的裁剪保留配置提交版本控制。

每个里程碑交付：可运行构建、变更清单、测试结果、已知缺陷、原始测量、恢复方式；G2/G4/G6 是必须停下核对证据的阶段门禁。仅文档编写不触发安装 Unity、修改当前世界或发布 Steam。

## 9. 首批执行顺序

1. 从 M0 的功能清单、数据备份和回放导出开始，冻结迁移依据。
2. 完成原生 SQLite/序列化/模型加载兼容性烟测，再建立完整场景。
3. 交付 M2 可玩的 Unity 样板和性能报告；通过后进入核心迁移。
4. G4 完成单一权威切换，G6 完成 Steam 验收，G7 证明后续游戏复用。

最终交付应是“可发布的第一款原生游戏 + 经第二款示例验证的基础框架”，而不是只有一个 Unity 工程目录或一套抽象接口。
