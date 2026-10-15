# 常驻 MiniMind3 与远程模型验证（2026-10-15）

## 已验证

- `npx vitest run tests/model-manager.test.ts tests/model-fallback.test.ts tests/model-bootstrap.test.ts tests/remote-model.test.ts tests/remote-proxy.test.ts tests/remote-http.test.ts tests/native-runtime.test.ts tests/native-host.test.ts tests/dialogue.test.ts tests/npc-dialogue.test.ts tests/minimind.test.ts tests/minimind-runtime.test.ts --maxWorkers=1`：12 文件、95 项通过。
- `npm run build`：TypeScript 与生产构建通过，保留原有大包体积提示。`npm run check:npc`：通用包依赖边界通过。
- 首轮 `npx playwright test e2e/model-settings.spec.ts --reporter=list`：5 项通过（4.8 分钟）。真实 Chromium、1440×1000、同源生产 preview `http://127.0.0.1:4173`。
- 真实 68,189,920 字节 Q8 权重在开局前进入 ready、SHA 校验并保存 CacheStorage。第一次 1 个 GGUF 请求，刷新后 0 个。优先模型切换/恢复期间 MiniMind3 保持 ready。
- 受控本机接口验证选择持久化、独立进度、有限重试、手动恢复。受控远程接口验证新增/测试/编辑/删除、选中后优先、会话密钥不写 localStorage、刷新缺少密钥时使用真实 MiniMind3。
- 实际 Node HTTP 同源桥测试：拒绝不同来源、私网目标、无效 JSON，错误不包含测试密钥。当前运行的 5173 游戏服务已返回远程接口公网地址校验错误，证明新路由已生效。
- 浏览器技能连接失败（privileged native pipe bridge is not available; browser-client is not trusted），按计划使用项目 Playwright。桌面截图保存在本任务外部 visualizations 目录；缓存界面已视觉检查，无遮挡/横向溢出，长设置面板可滚动。
- 新鲜上下文计划审查与代码审查完成，无剩余阻塞项。

## 整体工作区的独立失败

首轮 `npm test`：627/630 通过，physics、vegetation、weather 各一个 5 秒超时。串行复跑 `npm test -- --maxWorkers=1`：660/668 通过，6 文件 8 个断言失败；模型相关测试通过。两轮之间其他任务修改了地形相关工作区（terrain.ts 时间为 09:19），新增了其他测试。本次没有编辑这些物理、地形、天气或狩猎实现，也未宣称全套通过。

- `habitable-homes.test.ts`：standing headroom / room footprint / closed back wall。
- `late-recall.test.ts`：seed17 MLP recall journey。
- `physics.test.ts`：high-speed solid sweep；fast rock impact。
- `village-functional-layout.test.ts`：training perimeter north wall。
- `weather-policy.test.ts`：normalized raw weather context；protected gathering weather values。
- `wilderness.test.ts`：three-day gathering food threshold（48 < 50）。

补充真实 WASM 社交用例首轮在进入游戏前失败：角色初始配置 IndexedDB 操作超时，UI 保留原存档并提供内置初值启动。这一轮没有到达模型对话，不能作为模型推理失败证据。

## 证据边界

本次没有连接真实远程供应商/真实远程密钥。协议、错误、超时、地址隔离及 HTTP 入口有测试；远程 UI 使用受控响应，不能据此宣称供应商服务可用或回答质量达标。原生模型切换采用受控接口，本轮没有重新跑真实 Qwen 权重。

刷新免下载不等于跨刷新保留 WASM 内存；页面刷新仍重建 Worker 并初始化推理。浏览器自行清理存储、配额不足、非安全 HTTP 环境仍可能无法保留权重缓存。纯静态部署保留 MiniMind3；远程转发需要 Node/Vite 游戏服务。

## 补充浏览器结果

补跑 `e2e/model-settings.spec.ts` 的缓存、远程配置和远程生成故障三个用例均通过。实际远程生成返回受控 HTTP 503 后，当前路由变为 MiniMind3，原远程选择仍保留。此前五项加上新生成故障用例，共六个独立模型设置浏览器场景已通过。

真实 WASM 社交用例单独复跑已进入对话，但四次采样未出现通过校验的 MiniMind3 台词，未到达后续离线步骤。添加 Worker 诊断后确认推理超时被取消，模型重复初始化，不能用加载 ready 代替台词成功证据。

独立 Worker、真实生产 WASM/GGUF、不加载 3D 场景：简短提示词推理 2637ms 完成，290 字的实际营地格式提示词推理 21247ms 完成；均被格式校验标记为 `skipped`，保留即时回应。这证明实际推理可运行，但没有验证合格台词质量。21 秒实测暴露原 20 秒整体期限过短，现调整为 40 秒，覆盖优先请求 5 秒 + MiniMind3 既有 30 秒窗口；新增 32 秒有效回复提交回归先失败后通过。没有修改模型权重或放宽字幕校验。

新增缓存优先修复：有效本地缓存不再请求在线模型清单，仅缺失/损坏缓存时检查清单并下载；缓存热启动不应受清单临时不可用影响。单测已通过；最终浏览器在刷新时将清单强制为 HTTP 503，验证零清单请求、零 GGUF 请求与 ready。

最终生产构建后的补跑：缓存清单 503 场景和独立真实 Worker 两项均通过（1.5 分钟）。同一 290 字营地格式提示词此次完成于 8883ms，结果仍为 `skipped`。模型设置共六个独立场景通过，独立 Worker 推理完成场景另计一项；没有把 `skipped` 计作合格台词。40 秒整体期限的代码及回归已验证，游戏内合格台词与完整离线游戏用例没有宣称通过。
