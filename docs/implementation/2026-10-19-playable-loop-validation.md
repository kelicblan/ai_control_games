# 首轮可玩闭环执行记录

计划：`docs/superpowers/plans/2026-10-19-playable-loop.md`，用户已于当前会话确认顺序实施。

## 边界与裁定

- Ruling: 在用户指定的 Unity 目录和当前功能分支原地实施，不另建工作树 — 大量依赖处于未提交迁移中，新工作树会遗漏当前正式客户端与世界服务 — 仅作定点修改，不重置、清理或整体提交。
- 不修改在途地图资源、场景和碰撞文件。
- 各阶段完成与实际游戏验收分别记载，不把自动化测试视为玩家试玩验收。

## 执行进度

- Task 1: 规则与 Unity 展示已实现；成长、去重、满级、属性差值和通知 EditMode 测试通过。
- Task 2: 工坊规则、迁移、移动和开放式工棚展示已实现；建设、取消、重复建设、旧工单兼容测试通过。
- Task 3: 指定接收人的实物交付、全体装备去向、卸下与重分配已实现；失能接收人失败保留物品、重试和权限回归通过。
- Task 4: 六阶段成果、动态风险、基础口粮估算与操作入口已实现；入库证据、成果保留及只读投影测试通过。
- Task 5: 完整权威规则夹具已跑通真实野生动物狩猎与搬运；模型重新采集训练完成，规则回归 219/219，Unity 构建、同包原生验收和正式 CMD 入口通过，已交付第一轮优化。人工连续完整试玩留作产品验收。

## 已运行验证

- `npm run check:village` 通过。
- 2026-10-19：成长、工单、工坊、交付、目标、历史压缩和装备借用共 13 条 Vitest 通过。
- `tests/village/playable-loop.test.ts`：建设→制弓→装备→实际动物攻击/收获→搬运入库→再次制作积累至二级→历史压缩后恢复，通过。动物初始状态是声明的隔离兔子夹具，不声称为玩家实际地图试玩。
- Unity `PlayableLoopPresentationTests` 2/2 通过，报告：`native/Artifacts/tests/31aa30ae33c940f3bee27efdc035e471/results.xml`。
- 首次 Unity 运行在 BuildReportRestService / Mono IOSelector 崩溃；使用项目已有 `-GuardBuildReportPort` 后成功，未修改 VPN 或系统网络。
- 旧 P2 Life 模型因权威源码指纹变化被正确拒绝；保留校验，重新采集和训练，不伪造来源或重写旧训练报告的指纹。

## 规则裁定

- Ruling: 工坊规则以 additive version 1 接入正式 shared-world P4 世界；旧规则夹具未开启该能力时继续复现原行为 — 避免把历史 P2 规则场景悄悄升级为新玩法。
- Ruling: 工坊成本木材12、石料4、绳索2，工时20秒另计移动；工位取仓储点偏移(7,6)并投影到现有可走网格 — 不修改地图或碰撞数据。
- Ruling: 旧世界启用工坊时不扣材料、不发资源，已接受制作任务登记为 legacyExecutions 允许完成；后续新任务要求建成工坊 — 保留进行中成果且不瞬移人员。
- Ruling: 自动交付仅执行玩家明确指定的制作交付；不自动夺取他人物品。交付失败保留物品并显示原因，重新分配须显式操作。
- Ruling: 首轮模型更新是真实重新采样和优化；战斗采样失败轨迹保留为失败，不重标记成功。老师模仿率与物理任务成功率分别验收。

## 最终候选包验收（2026-10-19）

- Unity IL2CPP：`native/Builds/Village-20261019-073759/CampMind.exe`，构建成功，0 errors、1 warning。EditMode 展示测试 3/3：`native/Artifacts/tests/1b05d7285abb4c9386c47283709ada84/results.xml`。后续仅更新原生重置探针和生命/体力整数展示，再构建同包验收。
- 新地图正式启动、实际工坊建设、制作与装备、成长与目标投影、原 HUD、模型设置、键盘、分页、聊天、暂停均通过：`native/Artifacts/slice-aa410fc0-133f-41da-823e-fa6d157cd475/village-result.json`。实际截图已检查，制作接收人文字完整可见，生命/体力没有长小数。SQLite 校验与服务重开通过，物品、revision 738、暂停状态和模型一致。
- 只读复制原存档后的同包正常启动自动迁移通过：`native/Artifacts/slice-8ec81bb7-b7fd-4370-84f0-81cef96fce44/automatic-upgrade.json`。9 名伙伴、物资、源归档、旧世界冻结和跳过历史波次均通过；服务重开维持 revision 21 与暂停状态。未重置用户正式存档。
- 原生诊断帧样本 467，P50 19.92ms / P95 30.77ms；仅是本次探针数据，不构成持续帧率或世界服务吞吐优化承诺。
- 最终 TypeScript 类型检查通过，回归 219/219、102 suites：`native/Artifacts/playable-loop-final/tests.json`。
- 同包六物种渲染/动画、移动、追猎与停止按钮、暂停、重置初始库存、自动运行、显式暂停和模型设置保留通过：`native/Artifacts/slice-ea477ece-e18a-4e56-85f6-8da8646d6d41`。服务重开保留 22 只动物、相同权重、生态时间 0.3 与暂停状态。该狩猎 UI 验收使用项目已有隔离森林出生夹具，并非营地到森林的人工徒步验收。

## 模型证据

- 当前权威源码指纹：`930e031168f4938e5ff2e7deebdf6be66f47bb7fb51505c56942e18d91c1efe0`。
- 在最终源码下重新采样并真正执行 NumPy 优化；Life 8530 条正轨迹、72 条负轨迹，Tactical 2212 条正轨迹、192 条负轨迹。负样本没有改成成功；训练、验证、测试种子隔离，按验证集选择检查点。
- Life 验证集老师一致率 98.4385%，Tactical 99.2629%。这不是生存成功率。
- `native/Artifacts/playable-loop-final/verification.json`：独立 Python/TypeScript FP32 计算对照、重命名与候选顺序不变性均通过；新地图隔离工坊生产和自主装备任务共 12 个留出种子，老师与 MLP 各 12/12 成功。场景使用声明的物资夹具，不代表任意生存局或玩家乐趣。
- Life 权重 `2178eba9503df91d94f2d01c0882e1f6ad1f942bbe51f31a22f0149c256ed6c1`；Tactical 权重 `77ffa0a8f9d8acfcfedb8e146db6de5c9d699f0fb24748acab52e20e32c1bc3e`。P2 模型也按当前源码重新采样、训练和验证，保留指纹门禁。

## 失败记录与边界

- 初次两个持久化/动物测试因与构建、原生探针并行而超时；降低并行竞争、以真实建设完成为终点，并按重型集成测试设置 120 秒超时后通过。没有修改规则来让测试成功。
- 两次早期工坊原生探针在持续轮询下等待客户端 `Pending=false` 而超时，数据库已实际建成工坊；改为等待权威状态确认后，正式包探针通过。
- 最后一次回归曾误带 `CAMP_WORLD_LAYOUT=new-world-v1`，导致固定旧地图坐标的 22 个断言失败；报告保留为 `native/Artifacts/playable-loop-final/tests-wrong-layout-env.json`，清除该环境变量重新运行。新地图单独通过真实原生验收，不改旧地图断言。
- C 盘本次临时构建因空间不足失败；改用项目 D 盘输出成功。自动审批拒绝删除本次失败目录，原因为策略阻止；未绕过审批，目录保留。
- 旧动物探针仍断言“重置后暂停”，与已发布的自动运行契约不符；未回退游戏行为，更新为核验 tick0 初始库存、自动推进、显式暂停后同包通过。另一次狩猎 UI 探针误在无附近动物的营地出生点等待按钮而超时，改用项目既有声明森林夹具后通过；失败报告保留。
- 玩家实际完整手动试玩和长期乐趣尚未验收。建设、制弓、装备、成长和目标界面经过原生自动操作；狩猎、搬运、升二级、完整六成果由真实权威规则集成测试覆盖，不能混称为人工完整通关。
- 仍使用既有模型/玩法能力边界，没有新增训练场、交易系统、职业树或地图建筑改造。

## 正式入口交付

- 发布门禁核验当前源码指纹、真实模型优化与验证、219 项回归、同包新档/旧档/动物 UI 和重启证据后，已更新 `native/Builds/village-current.json` 与正式 P4 模型；旧清单与权重备份位于 `native/Artifacts/playable-loop-final/deployment-backup`。
- 正式包：`native/Builds/Village-Verified-a4161550-4339-49c7-b0d4-43c9aa822bdf/CampMind.exe`。发布记录：`native/Artifacts/playable-loop-final/deployment.json`。
- 实际执行 `运行游戏.cmd`，由原 `play.ps1` 路径启动正确正式包：`native/Artifacts/slice-fa17c06f-7638-4cbb-9d8f-670b647a057a`。运行进程已核对，宿主响应确认新 Life/Tactical 权重、原世界 `campaign-4c6067cad001480e987e38b3`、10 名角色（领主及9伙伴）、待建工坊及当前目标“建造营地工坊”。沿用原存档暂停状态，没有清档。证据：`native/Artifacts/playable-loop-final/actual-launch-check.json`。
- 已打开正式游戏供用户试玩；本轮未创建 Git 提交，也没有把其他任务的未提交迁移打包提交。
