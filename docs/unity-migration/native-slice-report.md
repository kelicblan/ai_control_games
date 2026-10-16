# 原生纵向样板验证记录

日期：2026-10-16。当前是M1/M2进行中的样板，**不是完整迁移、G2通过或Steam发布候选**。

## 已验证

- Unity 6000.3.26f1、URP17.3.0、DX11真实窗口运行；26份原GLB、2833个固定场景物件、领主与9名真实骨骼NPC。
- 导出器直接读取现有地形、房屋/设施、围墙、树木与角色初始规则；源文件SHA256写入blueprint。房屋门洞未用整栋实心碰撞盒封堵。
- EditMode10/10；覆盖核心/兼容性、场景真实资源、Walk实际骨骼运动，以及修订号、请求epoch、世界scope与过期操作校验。
- Mono可玩样板通过实际Windows窗口运行，HTTP快照只读呈现；所有规则、库存和存档仍由单一TS世界服务负责。
- 新建隔离世界、领主输入、松键停止、NPC真实行动、指派采集、暂停、暴雨，以及SQLite保存后重启续玩链路通过。

| 证据 | 首轮 | 重启同一档 |
| --- | --- | --- |
| runId | `slice-3a974850-617c-4775-bcb1-7f82e5532011` | `slice-b1115948-3026-472f-95b5-502b5bb9e44b` |
| 初始/最终revision | 1 → 19 | 19 → 38 |
| 初始/最终世界时间 | 0 → 6.3秒 | 6.3 → 12.3秒 |
| generation/branch | 同一scope | 保持首轮scope |
| 领主位移 | 约16米 | 16米 |
| 释放输入后漂移 | 约0.000008米 | 约0.000008米 |
| 被采样NPC位移 | 约30.07米 | 约31.86米 |
| 采样领主动画骨骼变化 | 10根 | 11根 |

原始报告、Player日志、截图保存在对应`native/Artifacts`目录。首次批处理渲染得到黑图，明确排除；可视验收脚本拒绝batchmode。启动器隐藏窗口/失焦导致不推进的问题已修正为正常游戏窗口、后台呈现更新、失焦释放输入。失败运行有单独失败报告，自己的子进程已回收。

## 可重复启动

在新版工作区根目录：

```powershell
node --import tsx scripts/export-unity-scene.ts
./scripts/unity/test.ps1 -Suite EditMode -Editor 'D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe' -GuardBuildReportPort
./scripts/unity/build.ps1 -Scene Camp -Backend IL2CPP -Editor 'D:/Program Files/unity/Unity 6000.3.26f1/Editor/Unity.exe' -GuardBuildReportPort
./scripts/unity/play.ps1 -Backend IL2CPP
# 自动联调；模型调用显式离线，测试窗口结束后退出自己的服务。
./scripts/unity/play.ps1 -Backend IL2CPP -Probe
```

`play.ps1`只选择实际构建成功的Camp包。默认创建独立本机身份，使用`native/LocalData/ts-native-slice/world.sqlite`；不会连接18081旧服务或读取原玩家存档。首次点击创建测试世界，随后自动续玩。关闭测试窗口会有序退出自己的TS服务，保留独立测试档。

键鼠：Tab切换视角，WASD移动领主/平移上帝镜头，右键旋转，滚轮缩放，Home恢复镜头。面板提供暂停、倍速、NPC指派、喂食、表扬、召回、寨门和天气操作。当前面板是联调用原生调试UI，正式uGUI界面在M5验收。

## 仍未通过的门禁

- 完整场景IL2CPP Release已实际运行通过：`slice-4dbb5129-9d73-49f4-89d9-d1195e078018`，从同一存档12.3秒继续至18.6秒，领主移动约16米，释放后漂移0，NPC约27.16米，10根采样骨骼变化，暴雨；未见此前巨型PhysX碰撞警告。该短流程不代替下面的长期和性能门禁。
- 尚未运行15分钟全功能流程、三轮1080p基准或2小时长稳；短探针的帧数不用于性能达标结论。
- 纯渲染回放、TS桥接和最终C#权威的开销尚未分离。当前保留HTTP快照开销；不宣称最终原生输入/存档延迟已解决。
- 模型探针使用`offline-test`；工作语境规则台词已显示，真实MiniMind/指定模型、数据库确认和来源标识的完整对话链仍未验收。
- 建筑室内/遮挡、屋顶遮雨、雷电/风、高中低预设、LOD与纹理审计、地图/社会/记忆/模型设置/音频仍待补齐。
- C#完整规则、全量旧档导入、原生AI宿主、Steam适配和第二款游戏复用尚未完成；不进入M3全面重写或切换权威。
