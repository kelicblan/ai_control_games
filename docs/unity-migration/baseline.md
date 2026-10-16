# Unity 迁移基线：2026-10-16

源码基线：`987cb27`；迁移分支：`codex/unity-urp-migration`。按用户指定，新版工作区：`D:/workspace_zsfz/ai_control_games/ai_control_games_unity`。Unity工程目录为其下的`native/CampMind.Unity`。原Web工作区与正在运行的服务未修改。

## 当前阶段

M0 的数据与工具部分已实现；G0 **尚未通过**。Unity 工程目录和候选依赖已建立，尚未在 Editor 导入/编译；M1 的场景、资产导入、URP Asset、IL2CPP Player 均未完成，M2–M7 未开始。当前没有 Unity 性能成绩。

## 已执行的验证

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 原 Web `npm run build` | 通过 | 原依赖锁；保留 chunk 大小提示 |
| 旧版全量测试，2 workers | 911/921 通过，10 失败 | 迁移改动前采集；包含1项工作区缓存目录缺失 |
| 缓存目录补齐后的定向复核 | native-host全部通过；另有4项失败 | worker1项、physics3项；不代表所有超时都已复测 |
| TS / 进程生命周期迁移测试 | 10/10 + 4/4 | 夹具、数据库备份、GLB、Editor门禁、流式期限与异常进程回收 |
| C# Foundation + 桌面兼容性烟测 | 8/8 通过 | netstandard2.1核心、.NET8宿主；不是Unity/IL2CPP验证 |
| MiniMind3 原生模型/生成/取消/退出 | 通过，返回选项1，取消后槽位空闲、进程退出 | llama-server、2线程、512上下文；不是Unity生命周期、持续社会AI负载或语义质量证明 |
| Unity EditMode / PlayMode / Player | 未执行 | 未找到已安装且激活的Editor |

初次默认并发测试触发内存不足/IPC channel closed，随后改为 `--maxWorkers=2 --minWorkers=1`。不将第一次资源失败当成规则回归。全量失败详见 `baseline-failures.json`；超时、断言失败与环境缺失分别列出，迁移不得静默忽略。

原VSTest宿主的本机IPC连接未成功，C#验证改用进程内NUnitLite；同一Foundation用例也配置为Unity EditMode测试。此决定只改变测试运行器。

## 可重复数据

- `contracts/migration/feature-manifest.json`：实现/缺陷/设计愿景/迁移任务分开标记，映射源码与验收。
- `contracts/migration/fixtures`：8套真实规则回放，固定seed17、100ms步长、策略耗时归零、完整初始状态、命令/恢复操作、决策输入输出与检查点哈希。真实LLM与数据库生命周期另测。
- `asset-inventory.json` / `asset-manifest.csv`：26个源GLB的字节数、SHA256、唯一几何、骨骼和动画。领主有1套skin/2个clip，9名NPC各有1套skin/7个clip；地形约903168个源三角形。这些不是渲染draw call或Unity性能结论。
- `backup-world-for-unity.ts`：SQLite在线一致性备份，读取全部表、验证快照原始字节校验和、拒绝覆盖目标；不调用会修改旧档的SnapshotStore恢复流程。已用隔离测试数据库验证活动WAL、记忆表、会话和操作记录。

范围修正：当前 `LordState` 只有玩家身份、坐标、朝向和输入，没有生命值/死亡/继承机制。迁移保留现有领主操作与NPC死亡后持续世界，不将继承玩法伪称为已有功能。

## 可运行命令

在迁移工作区根目录执行：

```powershell
node --import tsx scripts/export-unity-fixtures.ts
node --import tsx scripts/unity-asset-inventory.ts
npm run test:migration
./scripts/unity/test.ps1 -Suite Core -Dotnet 'C:/Users/Lenovo/.codex/tools/campmind-migration/dotnet/dotnet.exe'
./scripts/unity/check-environment.ps1 -Json
# 模型与运行库位于原工作区；测试只读模型，不打开玩家存档。
node scripts/unity/smoke-minimind.mjs 'D:/workspace_zsfz/ai_control_games/ai_control_games'
```

最后一条在当前环境应返回退出码3及安装提示，不代表通过门禁。SDK安装在用户工具目录，不修改系统默认SDK。

备份仅对显式指定的数据库执行，目标必须不存在；真实玩家档未自动导出：

```powershell
node --import tsx scripts/backup-world-for-unity.ts SOURCE.sqlite NEW_OUTPUT_DIRECTORY
```

## 继续执行的前提

通过Unity Hub安装并激活候选 `6000.3.26f1`，包含Windows Build Support (IL2CPP)；安装满足该版本要求的C++构建工具。也可提供已有Unity.exe路径，再由兼容性检查决定是否调整候选版本。

激活后先执行 `scripts/unity/test.ps1 -Suite EditMode -Editor '实际Unity.exe路径'`，确认包解析/编译并提交生成的锁文件和元数据。随后在真实IL2CPP Player验证SQLite/JSON/模型进程，完成G0，再进行完整场景和原生样板。
