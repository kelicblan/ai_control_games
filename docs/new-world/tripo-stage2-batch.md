# 新地图第二批：六件初稿，已确认并执行

用户明确确认执行六件。充值后余额5870、冻结0；六份确切命令的`--dry-run --json`均通过，按相同参数顺序执行并逐件查看下载预览。六件均成功，实际共360积分；完成后余额5510、冻结0。没有额外重抽或收费处理。

| 资产 | 操作 | 任务ID | 实际积分 |
|---|---|---|---:|
| 主殿 | image_to_model | 69573021-d7c0-4e3c-8d15-c6304e53b18d | 60 |
| 大民居 | image_to_model | fdcd7c56-529a-4ed7-af92-ff9a9b5de3de | 60 |
| 瞭望塔 | image_to_model | b24bf0c3-e991-4a15-bdad-01c95c85eb4d | 60 |
| 展冠松 | image_to_model | eb62e583-7953-49cc-817c-dd7ba1ae441c | 60 |
| 阔叶树 | image_to_model | 5b35f1d6-b316-4257-b3ce-238a6cda1cdb | 60 |
| 雪山 | image_to_model | 7c442d2e-f354-48ee-b84b-6e9490d8491a | 60 |

与首批三件180合计，新地图累计生成9件、消费540积分。原始GLB、预览和任务记录均保留；复制进Unity的六件逐文件SHA256一致，实际三角面数均在批准上限内。完成源文件检查不等于通过总图造型验收。

输入目录：`native/ArtSource/new-world-20261017/reference-pack/04_model_references/`。

| 顺序 | 名称 | 输入 | 面数上限 | 预计积分 |
|---|---|---|---:|---:|
| 1 | new-world-stage2-hall | 01_lord_main_hall.png | 60000 | 60 |
| 2 | new-world-stage2-large-house | 03_large_village_house.png | 40000 | 60 |
| 3 | new-world-stage2-watchtower | 04_watchtower.png | 30000 | 60 |
| 4 | new-world-stage2-spreading-pine | 13_spreading_pine.png | 20000 | 60 |
| 5 | new-world-stage2-broadleaf | 14_broadleaf_tree.png | 20000 | 60 |
| 6 | new-world-stage2-snow-range | 11_snow_mountains.png | 40000 | 60 |

六次API调用按表顺序串行执行，每次均为`POST /v3/generation/image-to-model`。模型CLI别名`tripo-v3.1`，实际值`v3.1-20260211`。

共同参数：`geometry_quality=detailed`、`texture_quality=detailed`、`texture_version=v3.5-20260815`、`delight=true`、`texture=true`、`pbr=true`、`model_seed=20261017`。面数上限按表。每次估算图生含贴图30 + detailed贴图10 + detailed几何20 = 60，总计360，最终按`credits_consumed`核对。

无转换、重贴图、拆分、动作、LOD收费步骤；无自动重抽。不重生成首批三件。服务失败积分退回，成功但造型不符不自动重抽。

结果预期为GLB、preview.png、task.json及服务提供的渲染图，写入`native/ArtSource/new-world-20261017/generated-stage2/tripo-out/<name>-<id8>/`。逐件查看预览、验证文件和费用再继续下一件。确切预检文件位于`native/ArtSource/new-world-20261017/generation-plans/stage2/`。

六件均为待修整初稿，不表示可以直接套入总图；可见位置、轮廓和尺寸仍服从用户选定总图。建筑机械连接、高台、长阶、桥和围栏继续采用可控结构，不进行整图AI生成。
