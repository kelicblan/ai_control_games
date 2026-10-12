# MiniMind-3 64M（Q8, 68.2 MB）本地运行

**游戏接入已实现：** 在游戏仓库根目录执行 `npm run dev:local`，启动 MLP 决策 + MiniMind3 后台台词。首次克隆先执行 `python minimind3/setup_assets.py` 恢复模型与 DLL。启动、同源代理、后台缓存与模型能力边界见 [游戏接入说明](INTEGRATION.md)。下文保留原推理与训练环境记录，原速度数字为历史 CLI 测量，不代表游戏延迟。

模型: [jingyaogong/minimind-3-gguf](https://huggingface.co/jingyaogong/minimind-3-gguf) 中的
`minimind-3.q8.gguf`（68,189,920 字节 ≈ 68.2 MB，64M 参数，Q8 量化）。
MiniMind3 为 Qwen 风格分词器 + ChatML 模板，带 `<think>` 推理链输出。

## 目录结构

```
minimind3/
├── mmchat.py              # 推理入口（ctypes 直调 libllama.dll，纯进程内、零网络）
├── llama.h                # 对应 llama.cpp 头文件（结构体布局参考，commit 631109b34）
├── model/
│   └── minimind-3.q8.gguf # 模型文件 (68.2 MB)
├── ollama/                # Ollama 0.40.3 便携版（只用它的 lib/ollama/*.dll，CUDA 已删）
└── minimind/              # ★ 微调套件（MiniMind 官方训练代码）
    ├── trainer/           #   train_lora.py / train_full_sft.py / train_dpo.py 等
    ├── model/             #   模型定义 + tokenizer.json（分词器自带）
    ├── dataset/
    │   └── lora_medical.jsonl  # LoRA 示例数据（2.5 万条医疗问答）
    └── out/
        └── full_sft_768.pth    # ★ 可训练基座权重（137MB，与 HF 源完全一致）
```

## 微调（LoRA）

基座是 `minimind-3-pytorch` 仓库的 `full_sft_768.pth`（SFT 后的 64M 模型，
`hidden_size=768`），已放在训练脚本的默认加载位置 `minimind/out/`。

以上基座和示例数据仅保留在本机，Git 忽略这两个目录。GitHub 克隆后若需训练，应另从上游准备基座和数据；`setup_assets.py` 仅恢复游戏推理需要的 GGUF 与 DLL。

```bash
cd D:\workspace_zsfz\ai_control_games\ai_control_games\minimind3\minimind\trainer

# 先安装依赖（本机无 N 卡，装 CPU 版 torch）
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers peft rich einops

# CPU 上跑 LoRA（小 batch + 关闭梯度累积）
python train_lora.py --device cpu --batch_size 4 --accumulation_steps 1 \
    --epochs 1 --lora_name lora_medical --data_path ../dataset/lora_medical.jsonl
```

产出：`out/lora_medical_768.pth`。合并回基模后可走 convert_hf_to_gguf.py
→ `ollama/lib/ollama/llama-quantize.exe` Q8 量化 → 替换 `model/` 下的 gguf，
`mmchat.py` 直接推理微调后的模型。

## 使用方法（推理）

```bash
cd D:\workspace_zsfz\ai_control_games\ai_control_games\minimind3

# 单问
python mmchat.py "你好，请介绍一下你自己"

# 多问
python mmchat.py "第一问" "第二问"

# 交互对话（多轮，共享 KV 缓存）
python mmchat.py
```

编程调用：

```python
from mmchat import Chat
chat = Chat()
print(chat.ask("你好", max_new_tokens=256))
```

实测性能（Intel Core Ultra 7 155H，纯 CPU，8 线程）：
模型加载 ≈ 0.1 s，生成 ≈ 250 token/s（约 500 字/秒）。

## 为什么不用常规方式跑（本机踩坑记录）

1. **llama.cpp 官方 Windows 构建（CPU/Vulkan，b10598~b11559）全部死锁**：
   模型文件能完整读入内存，但在加载后/首个图编译前冻结（CPU 时间归零），
   换线程数、换 load-mode、强制基础 CPU DLL 均无效。疑似与混合架构 CPU
   （P/E core）或系统环境相关的同步原语死锁。
2. **腾讯电脑管家（QQPCRTP.exe）拦截未知程序入站连接**：
   Ollama serve / llama-server 监听的 127.0.0.1 端口，任何客户端都连不上
   （连 netsh portproxy 转发都被拦）；换端口、改 exe 名无效。系统已有进程
   （如 python.exe）的监听端口不受影响。
3. **最终方案**：Ollama 自带的 `libllama.dll`（MSVC/Clang 构建，不死锁）
   + Python ctypes 进程内直调 C API，完全不经过 TCP，绕开上述两个问题。
   注意两个坑：DLL 名为 `libllama.dll`；需先 `ggml_backend_load_all_from_path()`
   显式加载 CPU 后端；`llama_tokenize` 的 `text_len` 必须显式传字节长度
   （传 -1 走 strlen 路径会触发内部 abort）。

若以后想用 Ollama 原生 CLI：在腾讯电脑管家中放行 ollama.exe 后，
`set OLLAMA_HOST=127.0.0.1:11434` 并 `ollama serve` 即可（模型库在本目录
`ollama/models`，用 `ollama create minimind3 -f Modelfile` 导入 GGUF）。
