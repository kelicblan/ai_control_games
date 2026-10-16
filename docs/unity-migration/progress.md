# Unity 迁移进度

计划：`docs/superpowers/plans/2026-10-16-unity-urp-migration.md`。源码基线：`987cb27`。分支：`codex/unity-urp-migration`。

用户指定的新版代码目录：`D:/workspace_zsfz/ai_control_games/ai_control_games_unity`；Unity Hub应打开`native/CampMind.Unity`子目录。1156个文件逐一SHA256核对通过，Git工作区登记已指向新目录。删除旧C盘副本的递归清理操作被自动审批拒绝，旧副本暂时保留，不作为活动工作区。历史测试报告中的旧绝对路径保留为原始执行证据。

## 2026-10-16：M0数据与原生基础准备

已完成：22项功能边界、26个GLB清单、8套确定性规则夹具、完整SQLite在线备份工具、独立C# Foundation包、Unity工程依赖骨架、环境检查与测试入口。

验证：新增TS测试10/10、进程生命周期回归4/4；C# Foundation/桌面兼容性8/8；TypeScript检查和Web生产构建通过。MiniMind3原生加载、受约束生成、流式取消、槽位回收、进程退出通过。隔离世界备份包含9张表、2份快照，明确标记`importReady:false`。

既有基线：921项中911通过、10失败；其中1项来自独立工作区未建立的缓存目录，补齐后native-host用例通过。其余断言/超时未修复，不能宣称全套通过。

## 阶段状态

| 阶段 | 状态 |
| --- | --- |
| M0 / G0 | 部分完成；Editor激活、包导入、EditMode 7/7、Mono与IL2CPP Release Player兼容性烟测通过；依赖/资源授权仍需核对 |
| M1 | 真实场景、12处室内、遮雨/风雷、寨门/昼夜、保守LOD、三档质量、84处资源/43只动物已实现；IL2CPP实机/室内切换通过，探索遮罩、动物近景及质量/纹理审计待完成，G1未通过 |
| M2 | 最新Mono/IL2CPP隔离TS权威样板及生态投影通过，保存续玩和两后端真实2B回复/SQLite确认通过；断连/幂等矩阵、15分钟流程与性能矩阵待完成，G2未通过 |
| M3–M7 | 未开始；不能在G2前全面重写权威规则或切换存档 |

## 已作决策

- 原生工作区工具因会话根目录不是Git根目录而失败，使用git创建独立工作区；原分支和玩家存档不变。
- 按获批计划记录旧测试失败，继续不依赖失败项的数据工具；完整迁移验收仍需处理失败。
- 基础命令/版本/RNG/时钟提前用于兼容性准备，不迁移完整世界或切换权威；Unity编译后可能需调整实现。
- VSTest本机IPC连接失败，改用进程内NUnitLite执行同一核心用例；Unity EditMode验证仍待执行。
- 源码证实领主继承尚未实现，按当前玩法迁移；该功能需要后续独立实施。

## 本批代码审查

独立审查未发现Critical问题，发现的两项Important已修复：流式请求在等待响应头之前即启动期限；测试运行器在所有正常异常退出路径回收自己的子进程树。新增真实HTTP停滞/首块取消及真实子进程启动后异常测试，4项通过。固定输出目录可能残留旧成功报告的问题按“错误验收证据”风险处理，模型烟测现按唯一runId写成功/失败报告。

审查未签署Unity包导入/编译、EditMode/PlayMode、IL2CPP/AOT、真实旧档导入、Unity宿主生命周期、持续模型负载、原生性能或分发授权。这些仍为后续阶段门禁，不是本批代码通过审查即可豁免的项目。

## Editor与原生构建验证续记

使用用户提供的6000.3.26f1 Editor，修正带changeset后缀的版本识别。实际包导入及EditMode 7/7通过，锁文件已生成。将.NET输出移出Unity本地包，避免重复Foundation程序集。

用户要求VPN/TUN保持开启。当前环境中Editor的可选BuildReport REST服务触发Mono回环初始化崩溃；测试/构建脚本可用`-GuardBuildReportPort`在子进程生命周期内占用IPv4/IPv6回环38000，服务绑定失败后退出重试，Editor测试和构建可继续。未修改VPN、路由、系统防火墙或Unity程序集；这只是当前机器的局部绕行。

Mono Release兼容性Player实际退出码0，命令JSON往返、中文SQLite文件/文本重开、Direct3D11初始化通过。后端为Mono，SQLite版本3.53.4。该程序只包含兼容性测试，不是可玩游戏或性能验收。

首次实际IL2CPP构建报告目标后端未安装。Editor自带il2cpp.exe不足以证明Windows IL2CPP支持存在。用户授权安装后，已将Windows IL2CPP模块装入`D:/Program Files/unity/Unity 6000.3.26f1`，确认win64 IL2CPP Variations存在。官方安装包MD5与发布元数据一致，Authenticode签名有效。

BuildTools 2022 17.14.42、MSVC 14.44已安装，主程序、共享组件、下载缓存均指定`D:/Program Files/unity`。实际x64 C++程序编译、链接和运行通过。Windows SDK 10.0.26100及微软安装器部分系统文件仍由安装器写入C盘标准目录，未强行移动。

下载曾因官方重定向至缺失的中国镜像而失败；随后使用现有Clash核心启动独立的临时回环代理，经现有海外节点完成官方下载。原有Clash配置、节点选择和TUN未修改。下载结束后临时代理已终止，包含凭证的临时配置已删除。

IL2CPP Release实际构建通过（构建runId：`49baa4ef17e64cfc9b562d731c88ceb3`）。生成的Windows x64 Player实际启动并以0退出；后端确认为IL2CPP，命令JSON往返、中文SQLite存取/重开、Direct3D11初始化均通过（Player runId：`a6d38dfbbe8d43bf8e048fcdd48aa832`）。这是兼容性烟测，不能代替完整游戏、模型宿主、真实旧档或性能验收。

## M1/M2：真实场景与隔离可玩链路

已添加真实资源导出器、URP场景构建器、10个带动画角色、2833个场景物件与原生输入/相机/天气表现。地形碰撞按原三角形分条保存，避免巨型PhysX碰撞网格的FastMidphase限制；没有改写权威导航。Editor验证10/10通过，TS迁移回归11/11、场景导出1/1、进程回归5/5及TypeScript检查通过。

Mono原生客户端通过专用随机端口接入自己启动的TS服务，数据库位于`native/LocalData/ts-native-slice`。实际Windows窗口验证领主移动、松键停止、NPC行动、指派采集、暂停、暴雨、中文规则台词，以及保存后重启续玩。两次测试scope一致、revision从1经19到38，世界时间从0经6.3到12.3秒。源存档与旧世界服务未改动。完整报告及启动命令见`native-slice-report.md`。

当前是可玩纵向样板；HTTP快照桥接尚在、正式UI/真实AI链路和完整功能仍待迁移。没有性能达标或Steam发布候选结论。

完整场景IL2CPP Release也已实际运行通过，从同一测试档12.3秒推进至18.6秒，领主移动约16米，停止漂移0，NPC行动及实际骨骼动画通过。下一步补齐G1表现与G2正确性/性能门禁；依赖/资源分发授权继续作为发布前核对项。
