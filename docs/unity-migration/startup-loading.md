# 启动视频和加载门禁

启动素材：`Assets/Resources/Branding/logo.png`、`Assets/StreamingAssets/Branding/gamestart.mp4`，来源为项目父目录中用户指定的同名文件。

Windows 构建入口生成轻量 `Startup.unity`，关闭 Unity Splash，设置 Windows 图标，并将启动场景放在 Camp 前。视频先准备并显示，再异步加载 Camp 的场景资源；场景激活并完成首帧后等待世界同步和两个模型宿主就绪。首次视频播放完毕前不进入；加载超过视频一轮时继续循环，条件满足后进入。加载过程中禁用游戏输入，游戏 HUD 和游戏音频延后创建。

进度条按场景资源（50%）、世界连接（10%）、模型准备（40%）分配；模型部分基于文件校验、初始化、实际权重加载事件和最终就绪状态，不使用计时器模拟进度。校验和权重加载采用不同阶段区间，避免进入初始化时进度倒退。失败显示原因并提供重试，不以 MiniMind3 就绪代替所选模型就绪。

`/game-api/startup-models` 的 POST 开始或重试预热，GET 只读取状态。MiniMind3 与所选原生模型使用独立宿主和已有生成队列；远程模型使用已保存的配置进行小型真实请求确认。原生客户端与服务端均不读取浏览器 WASM 的加载状态。

从项目根目录的“运行游戏.cmd”启动，以获得世界服务地址与玩家身份。直接运行 EXE 缺少这些参数时会显示世界服务连接错误。

诊断：`node scripts/unity/verify-startup-models.mjs` 在独立数据库中实际预热 MiniMind3 与 Qwen 0.8B，结果保存在 `native/Artifacts/startup-models-*`。`start-native-slice.mjs --exe <EXE路径> --fresh --startup-capture` 可截图启动视频及进入游戏后的画面，输出启动门禁状态。普通 bridge/UI/AI 探针跳过启动门禁，不作为启动动画验收证据。

## 2026-10-17 验收记录

- 14 项 Vitest 测试通过（启动模型、MiniMind3/原生认知及独立世界 HTTP 边界），服务端严格 TypeScript 检查通过。
- Unity EditMode 启动门禁测试 5/5 通过；正式原项目 Windows Release IL2CPP 构建成功，日志：`native/Artifacts/builds/2ac56ef1eca646fc90f67499c0c3cfcc/editor.log`。
- 最终 EXE 实测视频、Logo、进度条正常显示，随后进入真实 Camp 场景并显示游戏内 Logo。独立数据库中 MiniMind3 和 Qwen 0.8B 两个宿主均真实就绪。
- 使用本地 HTTP 代理将就绪响应延迟至启动进程后 25 秒，验证慢加载。视频实测长度 15.083 秒，发生一次循环，游戏运行时间 23.706 秒时通过门禁进入；该时钟不含进程初始化阶段。报告与截图位于 `native/Artifacts/startup-models-c57988e1-ecd8-4d39-bc5b-9770c99c3fb3/`，最终运行日志无异常堆栈。
- 原始素材和打包素材 SHA256 一致。远程模型路径未进行真实账号请求验收。
