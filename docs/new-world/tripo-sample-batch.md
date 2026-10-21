# 新地图首批三件资产：已确认并执行

2026-10-17用户明确确认执行三件初稿。提交前实时余额3050，冻结0；doctor通过。三件任务均成功，实际总消费180，完成后实时余额2870，冻结0。没有付费重抽、额外转换或其他收费任务。

| 资产 | 操作 | 任务ID | 实际积分 |
|---|---|---|---:|
| 民居 | image_to_model | b3c23917-92f1-4c80-9075-0528c4244992 | 60 |
| 针叶树 | image_to_model | 8ddf2e9c-cdc6-40e9-b511-47db4215bd17 | 60 |
| 岩石 | image_to_model | f2bd68cf-eeb8-4cdb-8280-f31fd9c0b307 | 60 |

已逐件查看下载的preview.png并核对GLB结构、网格、材质、内嵌图片及SHA256。民居35477三角面、针叶树19417、岩石19624，均在对应生成上限内。详见Unity新样板`Models/sources.json`。这属于源文件验收，不代表最终造型、游戏碰撞或总图还原已通过。

输入均来自已校验的新参考图包`native/ArtSource/new-world-20261017/reference-pack/04_model_references/`：

| 顺序 | 名称 | 输入图 | 面数上限 | 估算积分 |
|---|---|---|---|---|
| 1 | new-world-sample-house | 02_village_house.png | 40000 | 60 |
| 2 | new-world-sample-conifer | 12_tall_conifer.png | 20000 | 60 |
| 3 | new-world-sample-rock | 10_rocky_peak.png | 20000 | 60 |

每件一个API调用，顺序执行：`POST /v3/generation/image-to-model`。CLI别名`tripo-v3.1`，实际模型值`v3.1-20260211`。参数：`geometry_quality=detailed`、`texture_quality=detailed`、`texture_version=v3.5-20260815`、`delight=true`、`texture=true`、`pbr=true`、`model_seed=20261017`，面数上限按表。面数参数不是实际结果面数报告。

估算按图生模型含贴图30 + detailed贴图10 + detailed几何20 = 每件60，共180；最终以任务`credits_consumed`核对。失败任务积分退回。仅三次首次生成，不包含自动重试收费、重抽、拆分、LOD、FBX转换、绑定或动作。

交付位置：`native/ArtSource/new-world-20261017/generated/tripo-out/<name>-<id8>/`，预期包含`model.glb`、`preview.png`、`task.json`。CLI dry-run的`deliverables`数组为空，表示没有附加转换链；不将该空数组解释成已经生成任何文件。实际下载后检查清单、文件内容和预览。

三份确切dry-run JSON保存在`native/ArtSource/new-world-20261017/generation-plans/`，均`valid=true`、无警告、无错误。实际执行使用相同命令，去掉`--dry-run`并加`--yes`；运行前打印的计划与预检一致。

生成物仅是待审初稿，先检查民居白墙木构、瓦顶飞檐、树枝冠层、石体轮廓及背景污染，再修整、导入并比较。结构性墙体、连接件、地形、高台长阶和通路采用可控模块制作，不整体生成地图。
