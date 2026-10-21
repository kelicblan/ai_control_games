# Unity 唯一客户端清理记录

日期：2026-10-17。范围：当前 `ai_control_games_unity` 工作区；旧独立检出目录未修改。

## 实施结果

删除旧 Web 游戏入口、React 界面与样式、Three.js 实时渲染、浏览器模型管理与 WASM 推理、IndexedDB 适配器、Vite 插件、网页预览、浏览器性能脚本、Service Worker、网页清单和 Playwright 端到端测试。移除相应直接依赖和浏览器 CI 流程。Vitest 自身仍会间接依赖 Vite，这不提供游戏网页入口。

`npm start` 运行 Unity 游戏启动脚本；`npm run build` 生成 Windows IL2CPP 游戏；`npm run check` 检查保留的 TypeScript 服务、共享逻辑和工具。README 与 AGENTS 已同步当前客户端约定。

保留 TypeScript 世界服务、SQLite、旧世界读取、MLP 权重、通用 NPC 与社会化逻辑、Unity 原生界面、音频、模型及地图资源。此任务没有实现新的玩法或训练 v4 模型。

## 共享依赖迁移

| 原位置 | 当前位置与用途 |
|---|---|
| `src/scene/geometry.ts`、`characters.ts`、`wilderness.ts`、`landscapeModel.ts` | `scripts/unity/asset-source/`，供离线资源导出使用 |
| `packages/world-ui/src/minimapRaster.ts` | `packages/world-core/src/minimapRaster.ts`，Unity 世界服务地图像素投影 |
| React HelpDialog | `config/ui/help.json`，保留相同中文内容，由 Unity 资源导出脚本直接读取 |
| Web Audio 播放类 | 删除；保留声音配表、纯波形计算和 Unity 音频导出 |
| 浏览器 MiniMind 资源准备 | 仅校验和准备原生推理宿主使用的 GGUF 与许可证 |

Three.js 和类型声明降为开发依赖：现有 Unity 资源导出、GLB 离线处理和 LOD 简化仍需使用。权威世界服务的导入图由新增测试检查，不允许依赖 Three.js、React、WASM 浏览器后端或 `import.meta.env`。

Unity HUD 已导入的肖像、图标和许可证继续保留；依赖 React 的一次性历史 HUD 导出器已删除。后续更新 HUD 应直接维护原生资源或增加独立资源工具。

混合测试只移除已删除 Web 能力的断言；保留人物状态、存档迁移、SQLite、模型证据、独立同意、世界频道记录、物理与天气规则等断言。纯 Web 测试随客户端一起删除。

## 验证

- `npm run check`：通过，退出码 0。
- `npm run check:npc`：通过，退出码 0；16 个通用源码文件通过依赖边界检查。
- `node scripts/prepare-minimind.mjs`：通过，本地 GGUF 完整性校验成功。
- `node --import tsx scripts/export-unity-ui.ts`：通过，帮助、配置、音频和声线夹具可导出。
- 针对性 Vitest：9 文件、29 测试通过，退出码 0，覆盖 Unity 唯一客户端、服务导入图、真实 HTTP、地图投影、资源导出、本地认知、对话提交和波形。
- `npm run test:migration`：8 文件、21 个 Vitest 测试与 8 个 Node 原生工具测试通过，退出码 0。
- `node --test tests/unity-process-lifecycle.test.mjs tests/unity-lod.test.mjs tests/unity-editor-world.test.mjs`：10 测试通过，退出码 0；包含真实编辑器世界服务启动、停止、独立存档与恢复。
- 首次全量检查：114 文件通过、2 文件失败；749 测试通过、4 失败。两项为长模拟默认 5 秒超时，两项为手动寻路距离断言。此后删除 Web Audio 与旧网页停止器的专属测试，最终全量结果见下方补充。
- 使用 30 秒单项上限复查 `engine.test.ts` 与 `physics.test.ts`：32 通过、2 失败，退出码 1；长模拟通过，两项寻路断言仍失败。
- 在隔离快照中恢复 HEAD 的策略加载代码，保留相同在途地图和规则，复现相同两项寻路失败，退出码 1。这些失败不由本次移除 Web 入口引入；不在本任务中修改地图或寻路行为。
- 最终全量检查：`npx vitest run --maxWorkers=2 --minWorkers=1 --testTimeout=30000`，114 文件通过、1 文件失败；731 测试通过、2 失败，退出码 1，耗时 127.15 秒。全部长模拟通过，剩余失败仅为上面已复现的两项寻路断言；未修改其断言或玩法来换取通过。
- 本次清理范围的 `git diff --check` 通过；整仓检查仍包含其他任务的 Unity 场景尾随空格，未改写其场景文件。
- `npm run build`：退出码 1。已有该工程 Unity 编辑器进程，构建保护提示先关闭工程；未强行结束进程，未替换现有 EXE。不能据此宣称最新源码已完成 IL2CPP 打包或画面验收。

完整执行输出保存在本机 `native/Artifacts/web-retirement/`。该目录是忽略的本地诊断产物，不进入发布包。移除前文件副本也保存在其中，防止误删共享内容；Git 历史仍可追溯旧实现。

## 与其他任务的边界

保留工作区原有 Unity、地图、地形、模型、场景和新地图工具的在途修改；共享导出器只更新依赖路径。未清档、未迁移运行中世界、未替换 MLP 权重、未调用外部推理、未推送或发布。

玩法升级继续遵循用户提供的联合计划，Web 表现层任务改为 Unity 接口和原生表现验收。地图由其他任务处理。
