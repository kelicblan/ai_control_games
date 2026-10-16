# Qwen3.5-0.8B 原生本地运行环境

当前默认使用原版 Qwen3.5-0.8B 的 Unsloth Q4_K_M 量化 + 原生 llama.cpp，已停用 GameSoul LoRA，使用模型内置对话模板。目录名 gamesoul 为历史命名。当前阶段提供独立推理环境，MiniMind3 的游戏接线留到代码更新后。当前模型路径与 API 名称统一读取 model-config.json。

## 运行

在游戏仓库根目录 `ai_control_games/` 执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\gamesoul\start.ps1
.\gamesoul\.venv\Scripts\python.exe .\gamesoul\scripts\smoke.py
powershell -ExecutionPolicy Bypass -File .\gamesoul\stop.ps1
```

服务地址：`http://127.0.0.1:18080/v1`，模型名：`qwen3.5-0.8b`。兼容 OpenAI Chat Completions；本地使用不需要 API 密钥。默认纯 CPU、20 个推理线程、4096 上下文、1 个推理槽、关闭思考输出。20线程不是20个并发会话。`start.ps1 -Threads 8 -Port 18081` 可调整资源与端口；验收脚本固定使用 18080。

GameSoul 已废弃为默认模型，旧适配器仅保留作实验记录。最新 0.8B 的7组复杂条件测试见 reports/qwen35-08b-complex.md；人工语义评价见 reports/qwen35-08b-review.md。历史4B和2B结果见 VALIDATION.md；不同线程和场景的速度不构成严格模型对照。

`GET /health` 检查服务健康，`GET /lora-adapters` 查看已加载适配器，`POST /v1/chat/completions` 生成对话。请求建议包含 `chat_template_kwargs: {"enable_thinking": false}`。游戏接入时应复用一个进程、限制队列长度，并校验模型给出的动作后再执行。

## 已固定的上游

- 当前模型：`unsloth/Qwen3.5-0.8B-GGUF`，revision `6ab461498e2023f6e3c1baea90a8f0fe38ab64d0`，Q4_K_M 文件 532,517,120 字节。下载来源与哈希见 assets-qwen35-08b.json，默认不下载视觉投影文件。
- 以下 GameSoul 与 Qwen3-4B 为历史实验资源，默认下载和运行均不使用：

- GameSoul：`NewOrigin/GameSoul-AI-NPC-4B-v0.1`，revision `9c269339a799d73bab3c7689f58ced8d457de866`。
- 基座：官方 `Qwen/Qwen3-4B-GGUF` 的 `Qwen3-4B-Q4_K_M.gguf`，revision `bc640142c66e1fdd12af0bd68f40445458f3869b`。
- GameSoul 训练基座配置声明为 `unsloth/qwen3-4b-unsloth-bnb-4bit`；这里使用同架构 Qwen3-4B 官方量化基座，效果需通过游戏测试确认，不能用于 Qwen3.5-4B。
- 原生运行程序与官方转换代码：`ggml-org/llama.cpp`，`b11577`。
- 历史适配器通过官方 `convert_lora_to_gguf.py` 转为 F16 GGUF，当前启动配置不加载该适配器。
- 当前使用量化模型内置对话模板，不使用 GameSoul 模板。

## 文件与复现

全部下载、依赖、缓存和日志位于本目录：

| 路径 | 内容 |
| --- | --- |
| `models/adapter/` | 原始 LoRA、角色模型说明、分词器与对话模板 |
| `models/base/` | Q4_K_M 基座及其许可证 |
| `models/qwen35-2b/` | 当前 Qwen3.5-2B Q4_K_M 模型与上游说明 |
| `models/qwen35-08b/` | 当前 Qwen3.5-0.8B Q4_K_M 模型与上游说明 |
| `models/gamesoul-f16.gguf` | 转换后的 LoRA |
| `runtime/` | CPU 原生 exe、DLL 与附带文件 |
| `vendor/` | 固定版本 llama.cpp 上游源码 |
| `.venv/` | 项目内 Python 转换环境，服务运行不需要 Python |
| `cache/` | 下载包、Python/Hugging Face/临时缓存 |
| `logs/` | 服务日志、进程身份、推理验收结果 |
| `assets-manifest.json` | 原始资源来源、字节数和 SHA-256 |

首次复现需要本机已有 Python 3.12：

```powershell
powershell -ExecutionPolicy Bypass -File .\gamesoul\setup.ps1
```

下载脚本支持断点续传，并对 Hugging Face LFS 资源及 GitHub 发布包校验上游 SHA-256。权重、二进制、虚拟环境、缓存与日志由仓库 `.gitignore` 排除。脚本、说明和资源清单可以提交。

默认 setup 准备 model-config.json 指定的模型，不安装转换依赖。历史 GameSoul 资源准备可用 `setup.ps1 -IncludeGameSoul`，启动脚本读取 model-config.json。

## 验收边界

`scripts/smoke.py` 对真实服务发送包含人物性格、体力、雷暴、换班失约经历与允许动作的中文请求，检查非空中文回答，保存完整请求、响应和耗时至 `logs/smoke-result.json`。此检查证明推理链路可用；人格一致性、长期记忆准确率、动作合法率及几百名 NPC 的负载仍需游戏接入后评测。

无需 HTTP 的当前模型推理检查：`.\gamesoul\.venv\Scripts\python.exe .\gamesoul\scripts\cli-smoke.py`。复杂条件测试：`.\gamesoul\.venv\Scripts\python.exe .\gamesoul\scripts\complex-benchmark.py --threads 20`，结果保存在 reports/，原始日志在 logs/complex-08b/。相同提示词的历史 4B/0.5/1.0 对照可运行 `scripts/compare.py`。

本次服务实际完成模型与 LoRA 加载并监听 127.0.0.1:18080，但自动化环境访问该端口超时。系统存在面向 Codex sandbox 用户的 loopback/outbound 阻断规则，尚未确认其与本次超时的因果关系；没有改动这些规则。HTTP 验收待在正常用户终端执行，不能将服务启动日志视为 HTTP 验收通过。

## 上游说明

- https://huggingface.co/NewOrigin/GameSoul-AI-NPC-4B-v0.1
- https://huggingface.co/unsloth/Qwen3.5-2B-GGUF
- https://huggingface.co/Qwen/Qwen3-4B-GGUF
- https://github.com/ggml-org/llama.cpp/releases/tag/b11577

GameSoul 模型卡标注 Apache-2.0；原始模型卡、基座 LICENSE 与 llama.cpp LICENSE 随资源保留。
