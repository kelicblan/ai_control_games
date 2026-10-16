# 模型设置验收记录

- 全部单元测试：30个文件、419项通过。包含切换取消、迟到响应隔离、最多2次自动重试、手动重置、原生驻留复用、请求所有权隔离和失败清理。
- NPC包边界检查通过；生产构建通过（保留现有大包体提示）。
- 浏览器：真实MiniMind3生成及离线缓存刷新通过；模型选择、进度、持久化、扩展清单和错误恢复采用受控桥接验证。
- 重试浏览器回归通过：初次失败后只自动重试2次，继续推进60秒无新增加载，手动重试恢复入口。另补充旧卸载队列恢复后不得清除新选择的回归测试，通过（原生宿主8项）。
- 原生端到端已通过（2026-10-13）：WFP证据确认Windows默认入站策略阻断回环连接；用户批准添加仅指定exe及127.0.0.1两端的TCP规则后，真实加载、刷新驻留复用、游戏内原生NPC回复均通过。该次游戏回复服务端耗时1828ms，无浏览器pageerror。现场记录在gamesoul/logs/ui-verification/，定位说明见native-connection-diagnosis.md。
- 浏览器插件因native pipe bridge不可用，浏览器验收使用项目现有Playwright。
- 未打包Steam exe；未提交或推送代码。

## 域名访问回归

2026-10-13通过http://aigames.nat100.top/实测：GET状态与清单、POST模型选择及生成均成功；浏览器实际完成0.8B就绪、刷新保留选择并复用operation、游戏内显示原生NPC回复，无pageerror。证据在gamesoul/logs/ui-verification/aigames.nat100.top/。独立域名API调用返回200及中文回复，服务端745.7ms，记录在gamesoul/logs/domain-api-verification.json。

已修正浏览器hostRequest的误导提示：网络失败、超时、非JSON响应分别报告接口路径和相应原因，非JSON响应包含HTTP状态；不再将任何连接失败都判定为纯静态站点。相关12项测试及生产构建通过。
