# 原生连接故障定位（2026-10-13）

已确认：Windows Filtering Platform 的默认入站策略拒绝了项目 llama-server.exe 的回环连接。此前将原因推测为 Codex 沙箱或 Clash，证据不足，撤回这两项归因。

同一 Node 父进程的对照：Node 子进程回环 TCP 成功（3ms）；llama-server.exe 已监听，但 TCP 返回 ETIMEDOUT（311ms），HTTP /health 同样失败。

WFP 事件：2026-10-13T08:14:13.008Z 和 08:14:13.352Z，PID 34124，本地端口65011，用户SID结尾1001，类型 FWPM_NET_EVENT_TYPE_PUBLIC_CLASSIFY_DROP，filterId 105867，filterOrigin Query User Default，isLoopback=true。应用路径为本项目 gamesoul/runtime/llama-server.exe。过滤器为 Windows 防火墙入站 ALE_AUTH_RECV_ACCEPT_V4 层的 Query User 默认阻断。

证据保存在 gamesoul/logs/native-wfp-events.xml、native-wfp-filters.xml、connection-probe.log。可使用 node gamesoul/scripts/probe-native-connection.mjs 重现对照。

已准备 scripts/native-models/allow-loopback.ps1，仅允许此绝对路径程序、TCP、源和目标均为127.0.0.1的入站连接，所有网络配置文件适用。需要用户批准后再执行，不停用防火墙，不修改Codex规则或Clash配置。使用 -Remove 可移除本脚本创建的规则。

用户确认后已添加规则 Campmind-Native-Llama-Loopback，并读取规则确认：指定项目exe、Inbound Allow、TCP、LocalAddress和RemoteAddress均为127.0.0.1。未修改Clash、Codex规则或全局防火墙开关。

修复后相同探测：原生TCP连接1ms，/health返回200和status=ok。0.8B经NativeModelHost实际加载约3.6秒；使用游戏公共提示词编排器生成中文回复约2.2秒。

真实浏览器在现有5173游戏服务上验证：默认MiniMind、切换0.8B就绪、刷新保留选择且reused=true、游戏内显示来源Qwen3.5 · 0.8B的NPC回复。该次回复服务端耗时1828ms。证据见gamesoul/logs/ui-verification/result.json及native-dialogue.png；并发请求中观察到busy降级，未进行多人容量验收。
