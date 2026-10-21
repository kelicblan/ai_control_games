# 重置后自动运行修复（2026-10-18）

现场世界 campaign-4c6067cad001480e987e38b3：tick=0、elapsed=0、paused=true，九名伙伴存在，动物 MLP 决策数为0。创建实验场景的默认暂停状态误用于正式重置；Unity 依据同一暂停字段冻结人物与动物动画，因此不是模型文件缺失。

修复：正式重置在创建世界的同一事务中设置运行状态；显式实验场景仍可暂停创建，用户手动暂停继续有效。主人物和动物共用权威时钟。当前主存档后续已运行，未再次重置或清除进度。

另修复宿主决策缓存：任务身份与状态进入 fingerprint，等待完成、任务完成或失败会触发下一次 MLP 重新选择，不再因身体与知识没有变化而沿用120秒缓存。只改宿主调度，未修改模型权重或权威动作规则。

证据：tests/animal-reset.test.ts 包含自动开始、真实人物MLP采集、动物MLP位移、手动暂停冻结；tests/village/policy-task-wakeup.test.ts 对短等待结束后的唤醒进行红绿测试。native/Artifacts/village/P6/reset-auto-start-tests.json：134项相关测试通过。正式运行 slice-3286d164-0d5e-4bd5-aab8-96b7226ad2d9；reset-activity-live.json 记录tick652到690、1名NPC及13只动物位置变化、动物累计5430次MLP决策、92条人物MLP任务记录（含历史任务）。

边界：部分NPC仍有 Logistics route blocked，涉及九人聚集后的实体通行；没有修改另一任务负责的地图、碰撞地形或寻路执行器，不能将这部分描述为完全修复。先前reset-result和formal-live-reset中暂停开局的报告为历史证据，不再代表当前重置契约。未在本轮重新编译或执行旧版原生reset UI探针；其暂停开局断言需要随下一次探针更新。

2026-10-19 补充：原生重置探针已按自动运行契约更新，并在首轮玩法包实际通过原确认 UI 检查初始库存、自动推进、显式暂停和模型配置保留。隔离森林场景证据为 `native/Artifacts/slice-ea477ece-e18a-4e56-85f6-8da8646d6d41/reset-result.json`，未重置玩家正式世界。
