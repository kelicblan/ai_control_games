# 候选依赖与验证状态

当前组合未通过Editor/IL2CPP，不能标记兼容性已确认。实际配置见 `native/toolchain.json` 和 `native/CampMind.Unity/Packages/manifest.json`。

| 依赖 | 候选版本 | 已验证 | 待验证 |
| --- | --- | --- | --- |
| Unity Editor | 6000.3.26f1 / de8167e7440c | 官方Release API存在，2026-10-08发布 | 安装、许可证、启动 |
| URP | 17.3.0 | 官方Graphics仓库6000.3/staging包声明 | 解析、URP Asset、实际渲染 |
| Input System | 1.17.0 | 官方包元数据存在 | 6.3导入、焦点与输入 |
| glTFast | 6.14.1 | 官方包元数据存在 | 真实GLB、材质、动画 |
| Newtonsoft Unity包 | 3.2.2 | 官方包元数据存在 | IL2CPP序列化与裁剪 |
| Test Framework / uGUI | 1.6.0 / 2.0.0 | 仅候选配置 | Editor解析与执行 |
| Foundation | 本地0.1.0 | .NET Standard2.1编译、6项核心测试 | Unity EditMode/IL2CPP |
| Windows SQLite | 系统winsqlite3.dll候选 | .NET P/Invoke创建、UTF8写入、重开成功 | IL2CPP、事务/恢复、最低系统确认 |
| MiniMind3 | 当前GGUF Q8 | SHA256、原生推理、流式取消、槽位回收和退出成功 | Unity生命周期、持续负载 |
| C#测试宿主 | SDK8.0.426 / NUnitLite3.14.0 | 8项通过 | CI配置 |

MiniMind3权重SHA256：`c994601ed72cb24addd206ed28ee7e8cea0283081a0434947c4e1e7a6d2ce45e`。模型与推理二进制不复制进Git；后续分发仍需核对许可证、归属和离线包体。

官方来源：[Unity Release API](https://services.api.unity.com/unity/editor/release/v1/releases?limit=1&version=6000.3)、[URP包声明](https://github.com/Unity-Technologies/Graphics/blob/6000.3/staging/Packages/com.unity.render-pipelines.universal/package.json)、[支持政策](https://unity.com/releases/unity-6/support)。

首次导入后提交Unity生成的`packages-lock.json`，当前不手写假锁文件。尚未执行Unity安装器、许可证激活或Steam发布。
