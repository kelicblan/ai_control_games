# 今晚别挨饿 · CampMind

## Unity 编辑器入口

在本仓库根目录双击 **`打开Unity编辑器.cmd`**。实际 Unity 工程位于 `native/CampMind.Unity`，使用 Unity `6000.3.26f1`，启动后打开 `Assets/CampMind/Scenes/Camp.unity`。

本机从 Hub 直接启动曾崩溃于可选的 BuildReport REST 服务（`Mono wakeup_pipes_init`）。上述入口在编辑器运行期间保留 IPv4/IPv6 本地回环端口38000，并跟踪启动时的进程交接；不关闭 VPN/TUN，不修改 Unity 安装文件。重复启动不会再开一个工程实例。启动记录位于 `native/Artifacts/editor`。

本机 Windows UAC 关闭，Unity 会显示管理员权限提示；当前入口没有改变系统权限配置。如接受当前管理员身份，选择 **Ignore Warning** 继续。受限令牌启动的尝试未通过 Unity 实测，已撤回，不能宣称本入口提供普通用户启动。直接从 Hub 打开仍不会启动端口保护，请使用上面的工程入口。入口会在退出/重启时保留最多30秒的交接保护，并兼容 Hub 小写 `-projectpath` 参数；失败时先释放端口再显示错误。

打开场景后按顶部 **Play**。编辑器会自动启动独立世界服务，片头结束后直接进入升级后的营地。旧档自动兼容升级，人物与库存保留、原档自动归档；没有旧档时自动建立开局，不需要选择模式或逐人映射。停止 Play 后所属服务自动退出。新地图编辑器存档位于 `native/LocalData/editor-new-world-v1`，与正式启动路径隔离。若 Game 窗口曾调成 4.6×/8.8×，先将 Scale 调回适合窗口的比例，避免裁掉屏幕四周的界面。


## 当前运行架构

Unity 是唯一游戏客户端。TypeScript 本机世界服务负责玩法、SQLite 存档、MLP 决策与大模型社会化；Unity 读取快照并提交命令。旧 Web／Three.js 游戏客户端、React 界面、浏览器 WASM 推理和静态网页构建已删除。

需要 Node.js 24+、PowerShell 7.2+ 和项目指定的 Unity 编辑器。先运行 npm ci 安装本仓库的服务和离线资源工具依赖。

- 打开编辑器：双击“打开Unity编辑器.cmd”。
- 生成 Windows 游戏：双击“生成游戏EXE.cmd”，或运行 npm run build。构建前关闭本工程的 Unity 编辑器和游戏窗口。
- 运行正式游戏：双击“运行游戏.cmd”，或运行 npm start。入口读取 `native/Builds/village-current.json`，校验原生代码和 v4 模型后直接进入正式营地；旧档自动升级并备份，已升级的存档继续恢复。收起营地面板不会退出玩法或停止世界。
- 单独调试世界服务：npm run world。不要与已有同端口服务重复启动。
- 准备本地 MiniMind GGUF：npm run npc:setup；本机推理使用 native host，不再准备浏览器 WASM。

编辑器 Play 与命令行游戏分别管理自己的世界服务和存档。运行入口负责关闭所属进程，不依赖网页服务。现有构建并不代表最新源码已重新打包，原生验证范围见 [迁移记录](docs/unity-migration/progress.md)。

## 验证和资源工具

- npm run check：TypeScript 类型检查。
- npm run check:npc：通用 NPC 包类型和依赖边界。
- npm test：世界、玩法、模型、社会协议和 Unity 接口测试。
- npm run test:migration：Unity 迁移接口与工具检查。
- node --test tests/unity-editor-world.test.mjs：真实编辑器世界服务生命周期与存档恢复。

scripts/unity/asset-source 保留 Unity 资源导出所需的离线几何源；Three.js 仅作为开发依赖用于这些工具与 LOD 简化，不进入权威服务或游戏客户端。packages/world-core/src/minimapRaster.ts 为 Unity 地图接口生成像素，不依赖 DOM。

Unity 帮助内容来源为 config/ui/help.json；scripts/export-unity-ui.ts 导出帮助、NPC 配置与音频。原生 HUD 图标和肖像资源保留在 Unity Resources 内。

## 玩法升级与阶段记录

正式运行行为以 [P3—P6 接入记录](docs/implementation/village/P3-P6-report.md) 为准。下面 P0—P2 的“尚未交付／默认关闭”描述是各阶段的历史边界。

按用户提供的“总体开发与双线设计 V1”推进玩法、Life／Tactical MLP v4 和实际社会行为闭环；文档中的 Web 表现入口统一映射为 Unity。地图由另一任务维护。

P0 规则导入、试验方案编译与新时钟的实施结果见 [P0 阶段报告](docs/implementation/village/P0-report.md)。`npm run village:import` 重新核对原表，`npm run village:compile -- --profile draft-table-v1 --mode draft` 编译显式试验配置，`npm run check:village` 检查新增模块。新玩法执行与 v4 训练仍按后续阶段验收，当前旧游戏和旧权重继续可读。

本次清理范围、验证结果和限制见 [Web 版清理记录](docs/unity-migration/web-client-removal.md)。历史文档中的网页启动、Vite、React 和浏览器 WASM 指令不再适用。

P1 的人物实例、命令事务、有限知识、独立同意协议、v4 观察／推理契约与同源回放见 [P1 阶段报告](docs/implementation/village/P1-report.md)。新模式服务入口默认关闭；本阶段只开放 WAIT 冒烟能力，尚未交付真实 v4 训练权重或 Unity 新玩法界面。

P2 已增加真实资源物流、制作工单、装备交接、招募成长、模型协商及 Life v4 alpha。范围、训练质量与限制见 [P2 阶段报告](docs/implementation/village/P2-report.md)。`village:collect:life` 采集同源执行数据，`train:v4:life` 训练到独立目录，`village:evaluate:life` 运行真实生产链对照。新模式和权重仍为工程试验；Unity 新玩法界面与 Tactical 训练尚未交付。
