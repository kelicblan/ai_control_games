# 候选依赖与验证状态

当前组合已通过Editor、最小IL2CPP数据烟测，以及Mono真实场景和隔离TS权威联调；完整场景IL2CPP与完整游戏验收仍需执行。实际配置见 `native/toolchain.json` 和 `native/CampMind.Unity/Packages/{manifest.json,packages-lock.json}`。

| 依赖 | 候选版本 | 已验证 | 待验证 |
| --- | --- | --- | --- |
| Unity Editor | 6000.3.26f1 / de8167e7440c | 已激活、实际启动、Windows Mono/IL2CPP构建 | 干净机器分发 |
| URP | 17.3.0 | 包解析、Forward URP Asset、DX11实际窗口截图 | 高中低预设、完整性能矩阵 |
| Input System | 1.17.0 | 包导入、输入代码编译；权威移动释放烟测通过 | 真实键鼠、覆盖层失焦矩阵 |
| glTFast | 6.14.1 | 26个实际GLB导入；10个真实骨骼角色、运行时骨骼变化通过 | 材质/UV/方向全面审计、LOD、建筑室内 |
| Newtonsoft Unity包 | 3.2.2 | 最小IL2CPP命令序列化往返通过，Mono权威快照解析通过 | 完整IL2CPP桥接、复杂DTO裁剪 |
| Test Framework / uGUI | 1.6.0 / 2.0.0 | 包解析，EditMode测试运行通过 | 正式uGUI面板、字体与清晰度验收 |
| Foundation | 本地0.1.0 | .NET Standard2.1、核心6项、Unity EditMode及最小IL2CPP | 完整规则等价 |
| Windows SQLite | 系统winsqlite3.dll | .NET与IL2CPP P/Invoke创建、UTF8写入/重开成功 | 事务/恢复、最低系统确认 |
| MiniMind3 | 当前GGUF Q8 | SHA256、原生推理、流式取消、槽位回收和退出成功 | Unity生命周期、持续负载 |
| C#测试宿主 | SDK8.0.426 / NUnitLite3.14.0 | 8项通过 | CI配置 |

MiniMind3权重SHA256：`c994601ed72cb24addd206ed28ee7e8cea0283081a0434947c4e1e7a6d2ce45e`。模型与推理二进制不复制进Git；后续分发仍需核对许可证、归属和离线包体。

官方来源：[Unity Release API](https://services.api.unity.com/unity/editor/release/v1/releases?limit=1&version=6000.3)、[URP包声明](https://github.com/Unity-Technologies/Graphics/blob/6000.3/staging/Packages/com.unity.render-pipelines.universal/package.json)、[支持政策](https://unity.com/releases/unity-6/support)。

已生成真实`packages-lock.json`。已安装Windows IL2CPP和VS2022 BuildTools；尚未执行Steam发布。包许可：glTFast包附Apache-2.0；Newtonsoft Unity包装附Unity Companion License，其Third Party Notices中的Newtonsoft.Json/Json.Net.Unity3D为MIT；Unity/URP/Input/uGUI按各包本地LICENSE核对。原模型授权、MiniMind权重及推理二进制分发资格仍是发布前待核对项，本地迁移验证不能替代授权证明。
