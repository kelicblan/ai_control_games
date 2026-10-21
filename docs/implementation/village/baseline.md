# 新玩法实施基线

记录时间：2026-10-17，P0／T00。机器可读状态见同目录 baseline.json。

当前 HEAD 为 `d8c48b582a0b55b41a4c6ca24af78ad93a73364f`，分支为 `codex/unity-urp-migration`；与设计文档历史提交不同。保留当前工作区内旧 Web 清理与地图／Unity 的在途改动，没有重置或切回历史快照。

| 项目 | 记录 |
|---|---|
| 原表 SHA-256 | `85bcb8a7baf520e6212a3c7f653884b834b7c7c4c1f8744e41765a22ad2eb0cf` |
| 旧权重 SHA-256 | `546acb1e75e44385d97267e23fe1d0bea11caa4311993fa54cc840e603c5dfcd` |
| 旧模型观测 schema | 3，44 维；不作为新 v4 模型 |
| 客户端 | Unity；已删除 Web 的启动与构建入口不再作为验收命令 |
| 旧时钟 | 420 秒白天／180 秒夜晚 |
| 新规则目标时钟 | 480 秒白天／240 秒夜晚，显式新模式使用 |

## 实际基线验证

- `npm test -- --maxWorkers=2 --minWorkers=1 --testTimeout=30000`：114 文件通过、1 失败；731 测试通过、2 失败，退出码 1，112.40 秒。失败均为既有 `physics.test.ts` 手动目标寻路距离断言。单项上限显式记为 30 秒，未修改测试断言或源规则。
- `npm run check:npc`：通过，退出码 0。
- `npm run build`：退出码 1，当前 Unity 工程打开，构建保护要求先关闭；未强行结束编辑器或替换已有 EXE。
- 现有 EXE 的独立原生 UI 基线：启动唯一临时世界与数据库后，`NativeUiProbe.Ui` 抛出 NullReference，探针退出码 1／Player 退出码 2。未能验证完整继续游戏、设置与社会选项流程，不能标为 UI 验收通过。记录位于 `native/Artifacts/slice-a43f80be-5ee7-41e4-8205-3275595d0f0f`。
- P0 实施期间一度观察到地图任务 `navigation.ts:80` 返回 Point 而预期 boolean 的类型错误；未修改该文件。最终整仓类型检查已通过，不能将该变化归因于本任务修复。

日志在 `native/Artifacts/village/P0/`。新功能测试结果和阶段门槛见 P0-report.md，不将原有失败隐藏成新功能通过。

本任务的 UI 探针使用 `native/LocalData` 中独立的 fresh 数据库，不导入、清空或迁移玩家现有存档。P0 不替换旧模型，不将旧状态原地解释成新规则。
