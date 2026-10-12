# 交付验证记录

验证日期：2026-10-12。以下结果来自本仓库实际源码、生产构建与已训练权重。

## 自动化结果

| 验证 | 实际结果 |
| --- | --- |
| `npm test` | 67 项通过：引擎 11 项、存档 48 项、模型 8 项 |
| `npm run build` | TypeScript 检查与 Vite 生产构建通过；生成 34 项同源离线缓存清单 |
| `npm run test:e2e` | 6 项 Chromium 端到端用例全部通过，用时 42.1 秒 |
| `npm run evaluate -- --output ...` | 14 个完整引擎回合，2,167 次真实决策，0 次异常回退 |

完整回合原始结果见 [evaluation-results.json](evaluation-results.json)，协议、比较和样本限制见 [evaluation.md](evaluation.md)。这次复跑的引擎与模型校验值和报告中的版本一致。

### 浏览器端到端覆盖

1. 加载真实模型，NPC 移动并工作；选中伙伴，暂停安排任务，恢复后实际决策输入包含该命令；分食扣减库存与饥饿值；空格能激活当前聚焦的音效按钮。决策 JSON 包含 36 个特征、8 个动作分数、合法动作及真实模型来源。关闭帮助和取消新旅程能恢复先前运行状态。
2. 在 390 × 844 触摸视口检查开场、游戏和决策面板，没有横向溢出；选中头像保持 36 × 43 像素且不会伸缩。
3. 生产 Service Worker 明确报告资源完整缓存后，让浏览器进入断网状态；重新加载页面、恢复存档，再次发出任务并产生新的本地模型决策 ID。
4. `cozy / standard / seed 17` 正常推进模拟、在最后半分钟全队回营，实际进入三人存活的胜利结算；相同种子重开时，速度与记录均重新初始化。
5. `hard / storm / seed 7` 无人指挥局实际进入失败结算，可查看失败局的真实模型记录。
6. 模型 manifest 请求返回 503 时，界面明确提示加载失败并阻止模型局开始；用户选择规则入口后，记录全部标为规则来源。

完整局用 Playwright `clock.runFor` 逐一执行定时 tick，不跳过模拟步骤。它验证流程与结果，不代表真实硬件的实时帧率或游戏耗时。

## 视觉检查

实际检查了 1536 × 1024 桌面截图，以及 390 × 844 移动视口的完整页面截图。检查对象包含开场、游戏、决策面板与胜利结算。地图资源正常加载，未出现页面脚本错误；中文标题、按钮与模型面板的中文状态均使用本地字体正常呈现。

- [桌面游戏](screenshots/desktop.png)
- [移动端游戏](screenshots/mobile.png)
- [决策观察](screenshots/decisions.png)
- [真实胜利结算](screenshots/victory.png)

相对美术概念图的实现与有意调整见 [visual-system.md](design/visual-system.md)。

## 环境与边界

本次使用 Node.js 24.19.0、Linux x64、无头 Chromium 153。浏览器路径通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向环境中已有的 Chromium；常规开发机器按 README 安装 Playwright Chromium 即可。

移动端验证为视口和触摸仿真，未宣称实际手机硬件、Safari 或 Firefox 已验证。没有测量手机峰值内存。仓库的 GitHub Actions 工作流也包含单元测试、生产构建和 Chromium 端到端步骤；远端工作流的运行结果应以 GitHub Actions 页面为准。
