# 一寨之主 · 默认二维像素地图版本

当前默认客户端已经改为 Unity 二维像素地图，首批区域为 **32 km × 32 km**，含180×160米村寨与西北金矿。旧3D客户端不再作为默认启动或构建回退选项。

**当前是地图开发阶段，不是完整玩法迁移交付。** 目前只有一个真实受控地图角色；九名NPC、MLP、正式生产与大模型社会化尚未接入此地图。原有 TypeScript 玩法、模型与社会化源码保留，不能因为默认入口切换就声称这些系统已经迁移。

## 统一入口

在指定工作目录 `D:\workspace_zsfz\ai_control_games\ai_control_games_unity` 同步 `main`，保留本机未提交修改。

- 编辑器：双击 **打开Unity编辑器.cmd**；打开已保存的 `Assets/CampMind/PixelWorld/PixelGame.unity`，按Play运行。
- 生成Windows游戏：关闭本工程Unity编辑器后，双击 **生成游戏EXE.cmd**，或运行 `npm run build`。
- 运行游戏：双击 **运行游戏.cmd**，或运行 `npm start`。

不再提供“打开2D像素地图.cmd”或独立验收菜单。Unity菜单统一为 **CampMind → 打开游戏**。

需要工程指定的Unity `6000.3.26f1`、PowerShell7.2+和Node24+。Node不在Unity可见PATH中时，设置 `CAMP_PIXEL_NODE` 为node.exe绝对路径后重新打开编辑器。

## 构建与运行边界

新构建输出到 `native/Builds/PixelGame-<时间与唯一ID>/CampMind.exe`，通过编译结果、源码指纹和产物SHA-256校验后更新 `native/Builds/pixel-current.json`。

没有新二维EXE、EXE与源码不一致或产物损坏时，正式入口会明确报错并要求重新构建，**不会偷偷启动旧3D包**。GitHub合并源码不等于用户电脑已经生成新EXE。清单的 `runtimeValidated:false` 表示尚未登记原生运行验收；编译成功不冒充视觉或性能通过。

## 存档与尚未接入的玩法

编辑器和EXE使用同一套二维地图数据：`native/LocalData/pixel-world-v1/world.sqlite`。同时启动时进程锁会拒绝第二个宿主，避免竞争写入。

旧 `native/LocalData/new-world-v1`、旧编辑器存档及此前地图验收存档均保留，不删除、不覆盖、不自动导入不兼容数据。当前二维地图从自身开局开始，旧人物进度、装备、生产和社会记忆**尚未迁移**；后续必须做显式备份、迁移和真实玩法验证，不能把旧档保存着说成已继续旧局。

目前支持真实行走与碰撞、寨门开关、有限资源采集、SQLite恢复、分块加载、鹰眼及区域总览。WASD行走，E采集/寨门，滚轮缩放，中键或方向键勘察，Home跟随人物，M全图。勘察相机不会传送玩家。

## 检查

`node --test tests/pixel-world/*.test.mjs` 检查地形、协议、SQLite、HTTP、统一入口、构建清单与宿主生命周期。

独立CI执行这些Node检查和C#9语法检查。它不是Unity编译，不能代替Windows实机、着色器、PlayMode、EXE及视觉验收。历史全仓库CI中的旧模型或退役3D资源缺失等失败不被掩盖。

本轮记录：`docs/implementation/2026-10-21-pixel-default-entry.md`。此前阶段说明只作历史记录，不再作为当前启动指令。
