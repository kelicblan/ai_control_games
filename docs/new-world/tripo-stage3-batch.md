# 第三批入口与围栏细节原件：已确认并执行

用户明确确认执行四件。四件顺序生成并逐件查看预览，实际各60、合计240积分。新地图累计13件780积分；完成后实时余额5270、冻结0。没有重抽或额外收费步骤，下面保留原始调用计划。

| 资产 | 任务ID | 实际积分 |
|---|---|---:|
| 寨门 | 693cc18f-120a-41c6-baae-e9a030cd30b1 | 60 |
| 寨墙 | 405de12d-8422-43c5-a61f-0cfe45948e93 | 60 |
| 低围栏 | 157c3328-b55a-44b6-b6f3-0141cb1bf461 | 60 |
| 木桥 | 013a6db8-6568-416e-835f-a794a13cd4af | 60 |

四件GLB均已核对文件头、缓冲/贴图嵌入、面数、费用和SHA256，再复制进Unity的stage3目录。最终造型和装配仍须实景验收；生成成功不代表达到总图。

用于替换目前仍很简略的寨门、寨墙、低围栏和桥的外观，并提取木构/石基/雕饰模块。正式位置、门洞和拼接仍由总图观测控制；生成原件不直接视为地图验收通过。整图地形不作为一个不可编辑模型生成。

输入均为用户新图包中已查看的单体参考图，根目录 `native/ArtSource/new-world-20261017/reference-pack/04_model_references/`。

| API顺序 | 输入 | 名称 | 面数上限 | 预计积分 |
|---|---|---|---:|---:|
| 1 | 05_village_gate.png | new-world-stage3-gate | 40000 | 60 |
| 2 | 06_palisade_wall.png | new-world-stage3-palisade | 30000 | 60 |
| 3 | 07_low_fence.png | new-world-stage3-low-fence | 15000 | 60 |
| 4 | 08_wooden_bridge.png | new-world-stage3-bridge | 40000 | 60 |

四次均为 `POST /v3/generation/image-to-model`，按表串行，逐件检查再继续。模型CLI别名 `tripo-v3.1`，发送值 `v3.1-20260211`；低围栏也显式使用此模型，不自动切换P1。

共同参数：`geometry_quality=detailed`、`texture_quality=detailed`、`texture_version=v3.5-20260815`、`delight=true`、`texture=true`、`pbr=true`、`model_seed=20261017`，面数按表。

每件估计：图生及贴图30 + detailed贴图10 + detailed几何20 = 60。合计240；加此前实际540，执行成功后预计累计780。最终逐件按 `credits_consumed` 核账；失败步骤退回，造型不符不自动重抽。

无付费转换、分件、重贴图、LOD或动作链；不重新生成人物。门扇拆分、拼接和碰撞在本地处理。

交付：GLB、preview.png、task.json及服务提供的渲染图，位于 `native/ArtSource/new-world-20261017/generated-stage3/tripo-out/<name>-<id8>/`。原件保留，进入Unity前校验GLB结构、贴图和SHA256，再进行总图比例及实景对照。

四份确切命令的 `--dry-run --json` 已通过，均一项API调用，无警告、无错误。原始预检JSON及可执行参数数组位于 `native/ArtSource/new-world-20261017/generation-plans/stage3/`。本预检没有提交生成任务或消费积分。
