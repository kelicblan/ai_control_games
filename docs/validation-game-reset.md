# 游戏重置验收（2026-10-14）

游戏设置底部增加「重置游戏」，二次确认后清除当前玩家的 NPC 心智/记忆/对话、玩家位置与操作进度、世界探索/事件/决策/统计、全部旧 SQLite 快照（包括隔离快照）及旧操作记录。创建种子 64138 的标准初始营地，速度恢复 1。角色初始配置、对话模型选择和模型文件保留，其他玩家不受影响。

后端在一个事务内完成清理和新快照写入；失败回滚，修订继续递增，本次操作标识保留以支持幂等重试。前端停止旧对话任务，清空语言缓存和统计、旧 localStorage 存档及视角记录，重建场景。场景销毁时禁止写回旧视角。

## 验证结果

- `npx vitest run tests/world-reset.test.ts tests/reset-storage.test.ts tests/world.test.ts tests/world-client.test.ts tests/npc-dialogue.test.ts tests/dialogue.test.ts tests/camera-memory.test.ts --maxWorkers=1`：62/62 通过。覆盖全状态初始化、自定义初值保留、配置校验失败、数据库写入失败回滚、快照/旧操作删除、玩家隔离、服务重新打开、幂等重试、旧修订拒绝和旧异步对话隔离。
- `npm run build`：通过；仍有既有的 JavaScript 大包体提示。
- `npm run check:npc`：通过。
- Playwright `e2e/game-reset.spec.ts`：1/1 通过。真实世界服务及 SQLite，独立端口 19144、独立 `data/reset-validation-20261014-19144.sqlite` 和新玩家 cookie；验证确认/取消、模拟写入失败及保留原进度、成功重置响应中的全部 NPC/玩家/世界初值、浏览器旧存档/视角清除、模型选择保留、刷新后恢复新世界，无页面运行异常。为避免可选推理影响重置流程，仅阻止 MiniMind 模型清单加载，未以此验证真实语言模型推理。
- Browser 插件连接失败：`privileged native pipe bridge is not available; browser-client is not trusted`，采用项目 Playwright 测试。截图：`docs/screenshots/game-reset-settings.png`、`docs/screenshots/game-reset-confirm.png`。
- 默认 `npm test`：585/590 通过，5 项超时（engine 两项、late-recall、vegetation、weather）。4 个文件串行复测 35/36 通过，剩余 engine 模拟用例超过默认 5 秒；使用 `--testTimeout=30000` 单独复测 engine，11/11 通过。未修改这些既有用例或全局超时，不能将默认全量测试描述为通过。

此次仅添加重置功能并在隔离数据中验证，没有替用户点击按钮清除当前游戏。
