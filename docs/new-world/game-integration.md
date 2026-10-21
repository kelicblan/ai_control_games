# 新地图已接入正式世界

2026-10-17，按用户“先将新的地图应用到游戏世界”执行。

## 运行

双击项目根目录 `运行游戏.cmd`。入口优先使用 `native/Builds/NewWorld-IL2CPP/CampMind.exe`，世界服务使用 `new-world-v1` 地图配置和 `native/LocalData/new-world-v1/world.sqlite` 独立存档。原有 Camp 构建和旧存档保留。不要直接双击 EXE 绕过本机世界服务启动器。

Unity 正式场景：`Assets/CampMind/NewWorldGame/Camp.unity`。校准场景仍保留；本次从实时编辑器保存的 Manual 副本派生，没有重新生成地图。主殿与箭塔等 2710 个原有变换均与保存副本一致。

## 本次接入

- 使用现有领主和九名属民的模型、骨架、动作和携物组件，按新地图人物比例归一化。
- 接入 NativeCampView、正式界面、天气、相机、TypeScript 权威世界桥和自动保存。
- 移除施工预览控制器和独立样件展示；以当前同机位为默认总览。
- 从实际场景地面、楼梯、桥面及障碍导出 0.5 米网格，筛选与入口连通的区域，供服务端移动、路线和出生点使用。领主在寨内道路出生。
- 建筑位置和屋檐包围盒导入服务端；休息点暂为可达的建筑外缘，没有生成房屋内部。
- 寻路分段保存，单段不超过既有存档限制的 128 个点；连续模拟恢复回归测试覆盖该问题。
- 建造、树木与地形可见物体保持原布局。采集资源点属于在实际可达寨外地面上推算的玩法点，尚未逐个绑定新的独立资源模型。旧版远郊动物与无限荒野的视觉接入不在本次验收内。

## 验证边界

最后构建记录见 `native/Artifacts/new-world-game-build.json`，编译错误与警告均为 0。TypeScript 类型检查通过。相关导航、领主控制和新地图存档测试共 30 项通过。

实机验证见 `native/Artifacts/slice-09d9910d-f853-4125-91bd-4e833d736576/`：正式菜单进入世界、十个人物、服务端领主移动、游戏总览和行走截图；持久化检查另见该目录 `new-world-persistence.json`。

本次完成运行接入，不代表与美术参考图一致。当前楼梯、桥头和河岸仍有明显几何/贴图衔接问题，外围近景有地形边界；视觉精修应继续在同机位对照下进行。不要将运行验证当作整张地图美术验收。

## 后续手调

正式场景手调后，地面或阻挡改变必须重新导出服务端网格，不能只改可见场景。校准场景手调后，可通过 CampMind → 新世界 → 将当前手调地图应用到游戏 更新派生场景；该操作保存手调副本。构建入口为 `scripts/unity/build-new-world.ps1`，不要调用旧 CampSceneBuilder 覆盖地图。

## 进入村寨无响应：输入交接缺陷

用户于 2026-10-17 报告原生鼠标点击无响应。此前测试通过 Button.onClick.Invoke 进入，未覆盖输入系统生命周期，因此漏检。

实际复现：`native/Artifacts/slice-bf7eda18-1c63-4023-ab10-4fe40900d4c1/new-world-result.json`，错误为 Startup left the game without an active EventSystem。

原因：NativeStartup.Finish 在自己的输入系统仍启用时调用正式界面初始化；正式界面看到 EventSystem.current 已存在，未创建输入系统。随后启动组件 OnDestroy 删除临时输入系统，正式界面失去指针事件。

修复：先停用启动组件拥有的输入系统，再初始化正式界面，使正式界面创建自己的输入系统；临时系统仍由原组件清理。

回归：新地图玩家验证改为检查 EventSystem 和真实 UI Raycast 命中，再注入 MouseState 按下/松开事件。必须通过界面进入、模拟移动和存档恢复才算成功，不再通过直接调用按钮回调验收。

修复后全屏实机验证通过：`native/Artifacts/slice-e03a37d1-2ef6-4a38-81d8-30f527b04991/`。`pointerClickVerified=true`，经鼠标事件进入村寨，九名属民载入、领主移动约 7.89 米，自动保存及恢复校验通过。发布构建为 `new-world-game-build-b713a2df66eb492184454cf6bcd5bb1b`。

## NPC 与领主停住、Request timeout：寻路重试阻塞

2026-10-17 实际复现：新建世界 `slice-fb36c0f5-b88e-462f-b318-912d85461b8f` 在约第 34 秒报告 Request timeout，游戏时间只推进到 15.5 秒。CPU 采样热点为 findGridRoute 和 newWorldTraverse。

原因：newWorldMove 把空路线当作每帧重新搜索的条件，无法找到路线时，每个 NPC 每 0.1 模拟秒都可执行 16384 节点搜索。多个 NPC 同时重试使世界推进和请求排队。

修复：保留失败或耗尽路线的模拟时间重试间隔（2 秒），目的地变化仍立即重新规划；不改碰撞、不瞬移、不增加网络超时。回归测试覆盖空路线保持到冷却结束，随后可重试。

验证：28 项相关单元测试通过，TypeScript 类型检查通过。故障存档重放平均单步耗时由约 28 毫秒降到约 5.9 毫秒（隔离本机采样，不是 FPS 指标）。新建世界 `slice-d065d52f-a39a-4758-b0fc-1199171fdb76` 开启本地社会模型连续运行 180 秒，所有连接采样正常；九名 NPC 均实际离开出生点，领主接口移动约 9.27 米，存档恢复校验通过。统计为 `native/Artifacts/new-world-timeout/before-after.json`。

玩家原存档仅以只读方式复制用于隔离复现，没有清空或重置。新增 `--trace-world` 和 `--soak-seconds` 仅供诊断，普通启动默认不输出逐请求日志。键盘输入验收记录后续追加。

最终全屏键盘验收通过：`native/Artifacts/slice-b572bae1-4ba5-4fb9-8b14-916659e7642b/new-world-result.json` 中 `pointerClickVerified=true`、`keyboardMotionDistance=5.94384432`。测试通过 InputSystem KeyboardState 输入进入 NativeCampView 原有键盘控制路径，随后验证服务端移动和存档恢复，未用客户端预览运动替代权威模拟。该运行保留本地认知/社会模型，40 秒持续连接通过；存档校验 `new-world-persistence.json` 成功。最终构建 `new-world-game-build-22d0e435d5d04fcf8d487ce62e4baa6a`。

Steam 架构评估：Unity 客户端加随包本机 Node 服务可以制作 Steam 发行版；当前 cmd/PowerShell/tsx/仓库路径链仍是开发入口，尚未完成独立发行封装。发行准备须把 Node 运行时、服务端编译产物和所需模型资源随包交付，以正式启动器管理子进程、唯一存档写入者、存档路径和退出清理，并在无开发环境的机器及 Steam 客户端验证。技术判断不等于 Steam 审核已通过。官方文档：https://partner.steamgames.com/doc/sdk/uploading?l=english 和 https://partner.steamgames.com/doc/features/common_redist 。
