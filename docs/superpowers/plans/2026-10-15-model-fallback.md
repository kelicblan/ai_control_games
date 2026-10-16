# 常驻 MiniMind3 与远程优先模型 Implementation Plan

> 执行方式：本会话 inline，使用 executing-plans；不隔离当前已有且尚未提交的模型管理功能，不提交其他工作区改动。

**Goal:** 页面启动预热持久缓存的 MiniMind3，并在可选本机/远程模型异常时自动兜底。

**Architecture:** 双生命周期 ModelManager、独立远程配置库及 Runtime、同源远程代理。实际来源与用户选择分离，取消沿用模型 generation。

**Tech Stack:** TypeScript, React, Vite, wllama, CacheStorage, Vitest, Playwright/browser-use。

## Tasks

- [x] 1. 添加 `tests/model-fallback.test.ts`：MiniMind3 预热、切换不卸载、同请求回退、加载故障、冷却恢复、取消隔离、独立重试。先运行 `npx vitest run tests/model-fallback.test.ts` 确认新行为失败，再重构 `src/integrations/models/manager.ts`。同步既有 manager 回归到双状态语义。
- [x] 2. 添加 `tests/remote-model.test.ts`、`tests/remote-proxy.test.ts`，先红再绿。新增 `src/integrations/models/remote.ts` 保存非敏感配置/会话 key，兼容运行时；新增 `scripts/native-models/remote.ts` 做协议转发、地址/体积/超时限制与错误脱敏，在 `plugin.ts` 增加 remote 路由。
- [x] 3. 在 `runtime.ts` 增加 bootstrap、远程目录同步；`src/main.tsx` 首屏启动。调整 `service.ts`、来源类型/检查及通知，优先模型异常但 MiniMind3 ready 时继续发起台词。保持模拟、存档、NPC 包边界。
- [x] 4. 设置 UI 展示固定兜底、可选优先模型、两组真实状态、重试和连接测试；独立远程表单组件避免主面板膨胀。最小修改现有中文源文件。
- [x] 5. 新增/更新 `e2e/model-settings.spec.ts`，验证首屏、缓存刷新、远程配置/回退。用浏览器技能查看桌面真实结果；运行 `npm test`、`npm run check:npc`、`npm run build`。更新 `docs/game-model-settings.md` 和本轮验证记录，注明真实远程服务凭据限制。

验收门：模型路由单测 + 代理单测 → TS/全套测试/边界/构建 → 真实 MiniMind3 缓存刷新和桌面浏览器 → 报告具体证据与未验证范围。

结果：目标链路 95 项单测与 6 个设置浏览器场景通过，另有独立真实 Worker 推理完成用例通过；构建和包边界通过。整体工作区仍有独立地形/物理等失败，未宣称全套通过；真实模型社交全流程和供应商边界见 `docs/validation-model-fallback.md`。
