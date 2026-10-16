# TS桥接原生协议 v1

这是M2隔离样板的现有HTTP协议适配，完整C#权威协议和存档格式仍未切换。

原生客户端在`GET/POST /game-api/world`带`X-Camp-Native-Protocol: 1`；响应在原快照上增加`schemaVersion: 1`。未带该头的原Web客户端保持原成功快照字段。未知/重复合并的版本在读取请求体和调用世界操作之前返回426及`UNSUPPORTED_NATIVE_PROTOCOL`；客户端拒绝缺失或未知响应版本，保持之前已接受的快照。

玩家身份仍通过`campmind-player` Cookie传递，原生独立测试身份为UUID；会话在`X-Camp-Tab`传递。`dialogueScope`为`generation:branch`，`revision`为JS安全非负整数，世界固定步长100ms由现有TS服务负责。当前传输未增加独立tick/事件水位字段，不能把它当作已完成的最终C#事件协议。

POST使用新的`operation` UUID，附上一份已接受的revision。非移动操作由服务端持久化去重；重复同一operation即使携带旧revision也返回当前快照，不重复扣资源。其他旧revision返回409及`REVISION_CONFLICT`。原生客户端刷新状态，但不盲目重发未确认的资源操作。领主移动保持短时输入租约、合并与失焦释放。

Unity真实网络测试确认：响应丢失时底层可重传同一POST，操作ID保持不变，不能假设只会有一个TCP/HTTP请求。服务端去重必须保留。请求失败/响应版本无效时客户端清空未发送队列，只发GET恢复；未连接时新资源操作直接拒绝。恢复有效快照后才重新允许操作。

`contracts/migration/protocol.schema.json`冻结此适配层形状；具体游戏命令/世界状态仍以TS源类型和解码器为准，尚未完成全量跨语言状态校验。G2仍需要15分钟流程、完整回放/性能及其余表现门禁。

实际后端HTTP用例`tests/unity-wire-server.test.ts`启动自己持有的随机端口和独立`native/Artifacts/wire-*`数据库，验证未知版本不能创建世界、Web兼容、一次喂食重复请求不再次扣粮、旧revision拒绝、进程关闭后连接失败、同档重启保持scope/粮食/暂停、重置改变scope。该用例不连接旧世界服务，也不等价于Unity网络故障注入。

Unity PlayMode `NativeTransportTests`另启自己持有的Node故障服务，使用实际UnityWebRequest和TsWorldBridge验证提交后连续丢响应、同ID重传、未发送队列丢弃、409、未知版本拒绝资源操作、恢复以及失焦零输入。它验证传输行为；持久化去重由上面的真实TS/SQLite测试验证，二者不混为一项。
