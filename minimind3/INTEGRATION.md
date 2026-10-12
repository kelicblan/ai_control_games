# MiniMind3 游戏内 WASM 台词

MLP 决定动作和情绪，MiniMind3 在浏览器 Worker 中通过 llama.cpp / wllama WebAssembly 续写台词。没有 HTTP 推理服务，不依赖 Python、Ollama、DLL 或 API 密钥。

## 启动和部署

```bash
npm ci
npm run npc:setup
npm run dev
# 生产静态资源
npm run build
npm run preview
```

`npc:setup` 只准备 WASM 和 GGUF。优先复用 `minimind3/model/minimind-3.q8.gguf`，否则下载 `assets-manifest.json` 中固定版本的模型，校验 SHA-256。预期 GGUF 为 68,189,920 字节。`npm run dev:local` 是 Windows 便利启动器，仅准备静态资源和启动 Vite，不启动任何推理进程。

部署整个 `dist/`，包括 `minimind/` 的 GGUF、WASM、许可证；服务器需按正确 MIME 类型提供 `.wasm`（application/wasm）和二进制 GGUF，不能返回 SPA HTML。可在子路径部署，资源和 Worker 均基于构建路径解析。无需 COOP/COEP 或 WebGPU；当前使用单线程 CPU Worker，降低浏览器兼容门槛。固定依赖 `@wllama/wllama` 与 compat 3.8.1，兼容 WASM 也本地托管。

## 下载、缓存与失败

场景就绪后后台下载同源 GGUF。先验证完整大小和 SHA-256，校验通过后一次写入 CacheStorage，随后把已校验的 Blob 交给 WASM，不进行第二次未校验下载。设备缓存以模型 SHA-256 为版本标识，损坏缓存删除后重新下载。下次打开先校验并复用；浏览器清理缓存后需要重新下载。

模型缓存命名 `minimind-model-<sha256>`，独立于游戏离线缓存；游戏更新不会清理它。GGUF 不加入 Service Worker 首屏预缓存，游戏可先进入。WASM 和 Worker 随游戏离线资源缓存。HTTPS/localhost 才能可靠使用 CacheStorage 和 Service Worker。普通 HTTP 无持久存储时尝试本次内存加载，SHA-256 在 Worker 中有纯 JS 回退；页面重新加载会再次下载。缓存配额不足仍可本次运行，但界面提示未能持久保存。

下载最多等待 180 秒，加载总任务最多 240 秒。失败保留预设台词并可重试。模型加载不受台词超时限制。共享模型只同时生成一句，每句最多 64 token、1024 上下文。台词等待 8 秒后取消，取消后仍保留推理占用直到 Worker 确认；5 秒未确认则终止并重建 Worker，防止死锁。暂停、关闭对话、重开或状态变化后的旧结果不能覆盖新反馈。已打开的暂停对话允许后台生成，不推进模拟时间。

## 质量和兼容边界

当前沿用 64M Q8 GGUF，使用显式 ChatML 和空 think 前缀，接在与事件匹配的第一人称短语之后续写。输入只包含当前人物的性格、事实、记忆与交流；关闭提示缓存复用，不能把其他人物的对话历史追加进来。只接受模型真实生成的完整句子，拒绝重复、格式错误、部分跑题、明显天气/疲劳矛盾及编造已完成安排；这些是启发式检查，不保证语义完全正确。需要游戏语料微调来提升自然程度。

此接入是现有网页游戏的端侧推理，不代表微信/抖音小游戏已经兼容。wllama 使用浏览器 Worker、Blob 和文件存储能力；WXWebAssembly/TTWebAssembly 与平台文件系统需要单独适配，Android/iPhone 的内存、耗电、速度尚待真机验证。Windows DLL 的历史耗时不可用来承诺 WASM 性能。

`mmchat.py`、`setup_assets.py` 和原 Ollama DLL 仅保留为离线开发/训练参考，游戏构建和启动不使用它们。原 HTTP 服务与服务端 smoke 脚本已删除。

## 验证

`npm test` 覆盖模型完整性、缓存恢复/配额回退、取消任务占用、超时恢复、人物/社交状态和异步结果失效。

`npm run build` 后执行 `NPC_REAL_TEST=1 npx playwright test e2e/dialogue.spec.ts`（PowerShell 用 `$env:NPC_REAL_TEST='1'`）验证真实 WASM 加载、暂停对话、冷下载及离线重载。普通浏览器测试无需模型，使用损坏/慢速资源验证降级与非阻塞。实际结果记录在 `docs/validation-minimind-wasm.md`。
