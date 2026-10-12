# MiniMind3 游戏台词服务

MLP 决定动作和情绪，MiniMind3 在 CPU 上后台续写台词。现有动作、气泡和受伤叫声立即响应，模型结果通过检查后再更新气泡。

## 启动

在游戏仓库根目录执行，Windows x64、Python 3.11+、Node.js 22.12+：

```powershell
# 首次从 GitHub 克隆后下载资产；本机已保留的文件会校验后复用
python minimind3/setup_assets.py
python minimind3/setup_assets.py --check-only
npm ci
npm run dev:local
```

`dev:local` 启动本机模型服务和 Vite；Ctrl+C 关闭由该启动器创建的模型进程。已有服务会复用，启动器不会结束复用的服务。仅启动模型：`npm run npc`；另一个终端启动游戏：`npm run dev`。生产预览：`powershell -File scripts/start-local.ps1 -Preview -Port 4173`。

模型权重 68,189,920 字节。首次恢复运行库需下载 Ollama 官方完整 Windows ZIP，体积明显大于实际使用的 CPU DLL；脚本只保留所需 DLL 和许可证，不使用 Ollama 网络服务，不安装 Python 第三方依赖。

## 文件与来源

| 文件 | 用途 |
| --- | --- |
| `npc_server.py` | Python 标准库 HTTP 服务，监听 `127.0.0.1:8765` |
| `mmchat.py` | ctypes 进程内调用 libllama，单个全局原生上下文 |
| `assets-manifest.json` | 固定下载地址、版本和 SHA-256 |
| `setup_assets.py` | 恢复与校验模型、DLL |
| `llama.h` | 对应 llama.cpp ABI 结构定义参考 |
| `minimind/` | 现有训练源码及其 Apache-2.0 许可证 |
| `model/`、`ollama/` | 本机模型和原生运行库，Git 忽略 |
| `minimind/out/`、`minimind/dataset/` | 本机训练权重与数据，Git 忽略 |

GGUF 来自 [MiniMind-3 GGUF](https://huggingface.co/jingyaogong/minimind-3-gguf)，固定 revision 为 `64f1758c2fecc37920ebdb635bad464636045db1`，SHA-256 为 `c994601ed72cb24addd206ed28ee7e8cea0283081a0434947c4e1e7a6d2ce45e`。运行库来自 [Ollama v0.40.3](https://github.com/ollama/ollama/releases/tag/v0.40.3)，脚本校验官方 ZIP digest 和每个已测试 DLL 的摘要。保留下载包及上游源代码的许可证。

不能直接替换为任意 llama.cpp DLL：ctypes 结构体布局必须与 ABI 匹配。本机此前普通 llama.cpp 构建出现过冻结，因此继续使用已验证的 Ollama CPU DLL。本机安全软件可能拦截未知 exe 的监听；此处由 Python 监听、DLL 在进程内计算。

## 请求与响应

游戏通过同源 `/npc-api/health`、`/npc-api/speech` 请求；Vite 开发和预览代理到本机服务。手机或内网穿透访问时仍由游戏服务器代理，不让手机访问自己的 `127.0.0.1`。部署到其他 Web 服务时配置同样的反向代理；纯静态 GitHub Pages 使用即时预设台词。

每次请求携带角色、人设、已经确定的动作/情绪、状态事实、事件、最近相关经历和近期台词。响应包含 `requestId`、`text`、`source=minimind3`、实际 `latencyMs`。健康检查不会等待模型推理。

服务仅允许一个原生推理任务，不积压请求。忙时、超时或没有合格句子时正常返回 HTTP 200、`source=template` 和 `outcome=busy/skipped`，浏览器保留即时反馈，不把正常跳过记为资源错误。每次请求清理 KV、使用随机种子，最多生成 96 token，原生推理预算 2.5 秒。浏览器 2.8 秒超时，但服务在原生计算与清理结束前始终持有推理锁。

## 当前能力边界

这是未经游戏微调的 64M 通用模型。实测自由改写会跑题，因此采用**与事件匹配的第一人称前缀 + 模型续写后半句**。不同前缀属于预设约束，后半句确实来自本地模型；不是完整自由聊天，也不声称能稳定理解复杂人设或长期记忆。

系统清除完整思考标签，拒绝未闭合标签、空输出、超长句子、近期重复、明显动作或状态矛盾和部分跑题表达。检查只能过滤明确问题，不能证明每句都符合完整世界观。拒绝时保留现有即时台词。后续需要用营地事件及合格台词微调，才能提高口吻和内容稳定性。

每个 NPC 有说话冷却；当前选中角色优先，前台事件优于缓存补充。成功后后台再生成一条相同状态的备用句；状态键、相关经历一致时立即取用，缓存最多 24 组、每组 2 句、30 秒有效。不能保证每个新事件都有缓存。暂停、切后台、重开、受伤或状态改变时，旧结果不会覆盖新反馈。中文朗读沿用已开启的本地中文语音；没有本地语音时只显示气泡。

在「营地」→「伙伴台词」查看连接状态、实际显示的生成/缓存数量和最近生成耗时，可关闭或重连。

## 验证

```powershell
npm test
npm run test:npc
npm run build
npm run test:e2e
# 启动真实模型后，运行额外真实模型浏览器测试
$env:NPC_REAL_TEST = '1'
npx playwright test e2e/dialogue.spec.ts
```

Python 协议测试不会导入 Windows DLL，可在 Linux CI 上执行。模型未附入 Git 历史，克隆后须执行资产恢复；训练仍使用 `minimind/trainer/`，训练依赖不属于游戏运行依赖。
