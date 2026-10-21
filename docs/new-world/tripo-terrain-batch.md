# 村寨地形源件：已确认并生成

用户明确确认后提交一次任务 `47721ef6-cffe-487a-94bf-ff2e4974801e`，状态success，实际60积分；新地图累计14件840积分，实时余额5210、冻结0。没有重抽或额外收费处理。

GLB共149,829三角面、83,217顶点、1材质、3嵌入贴图；SHA256为 `857f1a587199b10136fe6e2cc9a4e20102a71f7c7a94ac5753c1821d7e09b4d3`。预览已查看，文件结构与复制哈希已核对。尚未达到地图还原或正式接入验收。

输入为用户明确指出的 `模型/新地图原型/world_art_pack/04_model_references/09_terrain_base.png`。该图适合作为独立可修整地形源件；入口、五住宅用地、中央广场、主殿高台、河道的最终位置仍受已选总图约束。源图是干河床且入口在前部中央，不能将生成底座直接当作最终世界，也不保留展示用切边作为世界边界。

- CLI模型 `tripo-v3.1`，实际发送 `v3.1-20260211`。
- 一次 `POST /v3/generation/image-to-model`，输出基础GLB；不含额外转换、收费分件、重贴图或自动重抽。
- 参数：`face_limit=150000`、`geometry_quality=detailed`、`texture_quality=detailed`、`texture_version=v3.5-20260815`、`delight=true`、`texture=true`、`pbr=true`、`model_seed=20261017`。
- 预计积分：基础图生30 + detailed贴图10 + detailed几何20 = 60。失败费用按服务退回；实际以任务 `credits_consumed` 核账。
- 交付目录：`native/ArtSource/new-world-20261017/generated-terrain/tripo-out/new-world-terrain-base-<id8>/`，保留原件、预览及任务记录。
- 已执行准确命令 `--dry-run --json`：valid=true，一次API，无警告、无错误；预检没有提交任务或消费积分。

生成后先检查预览、网格/UV/贴图及地形高度，再局部拆分、按总图约束修整平台、院落地面、岩岸和道路；碰撞与权威高度必须由修整后的同一份几何导出。不是把参考画面贴到平面，也不以展示模型替代可行走世界。
