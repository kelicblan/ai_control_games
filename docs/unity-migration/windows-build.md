# Windows 点击打包与运行

项目根目录提供三个可双击入口：

所有CMD入口通过 `scripts/unity/resolve-runtime.cmd` 查找PowerShell 7：标准安装目录、用户安装目录、现有Codex运行时目录及PATH。Node未在PATH时也检查标准安装位置。仅调整本次脚本进程的PATH，不要求用户修改系统环境变量。已在移除PowerShell和Node路径的精简PATH下，通过真正的CMD入口完成独立游戏启动探针。

- `生成游戏EXE.cmd`：关闭本工程的Unity编辑器和独立游戏窗口后执行，生成Windows x64、IL2CPP、Release版本。
- `运行游戏.cmd`：自动启动固定输出版本及其必需的本地世界服务；关闭游戏后停止服务，下次运行不补算关闭期间的时间。目前不是只分发一个EXE即可独立安装的完成版。
- `清理旧构建.cmd`：移除历史GUID构建目录。首次清理优先将最新IL2CPP版本移至固定目录；未找到固定版本时保留一份最新可运行旧构建。跳过/拒绝正在运行的游戏目录、符号链接和不认识的目录。

常用输出固定为 `native/Builds/Camp-IL2CPP/CampMind.exe`，同目录的数据文件必须一起保留。Mono及Compatibility如果明确选择构建，会各保留一个独立固定目录。

生成过程中使用固定的 `.building-Camp-IL2CPP` 临时目录，成功后才替换上一版；失败清理临时目录，保留上一版。进程锁阻止同时打包，因此正常情况下最多临时占用新旧两份游戏的空间，不再每次留下一个2–3GB的GUID目录。日志仍保存在 `native/Artifacts/builds/编号`，便于失败排查。

默认Release生成完成后清理Unity标注DoNotShip的IL2CPP备份和Burst调试目录；需要保留这类构建调试文件时，调用 `build.ps1 -KeepBuildDebugFiles`，或使用Development配置。

清理不涉及 `native/LocalData` 存档、模型配置、Unity工程资源或 `Library` 编译缓存。需要预览清理范围时，在本项目根目录执行 `pwsh -NoProfile -File scripts/unity/clean-builds.ps1 -Preview`。

默认Unity安装位置在 `scripts/unity/build-game.ps1` 的Editor参数中；也可从PowerShell传入 `-Editor` 指定其他安装位置。

2026-10-17 验证：点击入口对应的build-game脚本实际生成IL2CPP Release（`native/Artifacts/builds/f56a3ef43f424fd9b0e006dd17622018`），发布到固定路径；移除DoNotShip备份后约1.62GB。固定路径启动探针 `slice-f81e824e-65f0-4e11-b9c9-75e0da757ca2` 通过，验证世界连接、控制输入、NPC动画与生态投影。清理预览不删除文件，实清理保留固定EXE与活动临时目录；根目录、存档目录、路径穿越目标被拒绝；持有构建锁时第二次构建在写输出前被拒绝。
