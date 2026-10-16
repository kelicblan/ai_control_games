# Game Model Settings Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Steps use checkbox syntax for tracking.

**Goal:** 游戏级模型选择、立即加载和真实进度；默认MiniMind3，支持原生0.8B及其他已登记GGUF。

**Architecture:** 浏览器ModelManager + Runtime契约，MiniMind和原生适配器共用。Vite开发/preview同源桥接按需管理llama.cpp router；桌面宿主以后替换适配器。

**Tech Stack:** TypeScript、React、Node/Vite、原生llama.cpp、Vitest、浏览器验收。

## Tasks

- [ ] 1. 测试先行：tests/model-manager.test.ts验证默认、存储、立即加载、切换取消和迟到结果；tests/native-host.test.ts验证目录逃逸与原生进度解析。先运行确认失败。
- [ ] 2. scripts/native-models/实现清单校验、进程管理、SSE进度和同源HTTP桥接；gamesoul/models.json注册0.8B/2B/4B；vite.config.ts挂载开发及预览插件。只启动一个router，按需加载一个子模型；超时/崩溃/退出清理。
- [ ] 3. src/integrations/models/实现Runtime契约、持久化设置、切换代际、MiniMind及Native适配器。MiniMindRuntime增加显式卸载；界面显示已准备/实际加载状态。
- [ ] 4. src/games/camp/dialogue/service.ts改用ModelManager；switch清空缓存并取消旧请求；对话来源与persistence扩展，同时保留旧来源兼容。无需变更纯npc包依赖边界。
- [ ] 5. src/components/GameSettingsDialog.tsx新增游戏设置；App顶部/营地及开局入口接入；CampDrawer和SocialDialog显示实际模型来源。样式沿用现有Modal，移动端可滚动，关闭不取消后台加载。
- [ ] 6. 完成单测、包边界、构建、浏览器设置回归和真实原生中文推理；记录哪些实际通过。最后独立整体代码审查并修复重要问题。

## Decisions / ledger

- 使用现有项目目录执行：用户要求全部代码/权重在本项目内，已有下载权重与未提交UI修改；不移动或覆盖用户修改。
- 用户已明确要求执行，不重复请求设计或执行方式确认。
- 不自动提交或推送；保留可审阅工作区diff。
- 原生加载使用router的真实SSE progress，load-mode none避免mmap进度失真；不做计时假进度。
- 未来桌面宿主仅定义适配契约，本次不宣称完成Steam exe打包。
