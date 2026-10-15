# 村寨功能分区调整与 Tripo 新模型计划

状态：用户已确认；三项模型已生成并接入，实际总费用 60 积分，最终验收记录见 `docs/validation-village-functional-layout.md`。

## 标注图对应布局

以用户 2026-10-15 提供的彩色分区图为依据，保持北侧领主府和南侧寨门的位置及寨墙轮廓。

| 标记 | 地图调整 | 资产 |
| --- | --- | --- |
| 红色 | 东北侧大片区域改为练武场，中央留空，木桩、箭靶和兵器架放周边 | Tripo 新生成练武场模型 |
| 黄色 | 9 座属民房屋：左侧外列 4 座、左侧内列下方 2 座、右侧下方 3 座 | 复用现有完整民居 GLB，调整点位 |
| 黑色 | 中南部改为村寨广场，压实地面或低矮石铺地，贯通南门至领主府的主轴 | 工程化地面和道路，不额外付费生成建筑 |
| 蓝色 | 西北内侧改为仓库，前门接支路 | Tripo 新生成仓库模型 |
| 绿色 | 仓库南侧改为兵器铺，开敞锻造工作区接支路 | Tripo 新生成兵器铺模型 |

风格延续现有村寨：灰瓦、木梁、暖灰墙体、石基，具有年代感；保持建筑原始完整模型，检查门洞朝向、角色比例和屋檐。

本次范围是地图布局、建筑资产和可通行空间。练武、仓储交易、武器制造等新的经营或战斗系统不包含在本次地图调整内。

## 工程影响

1. 新建统一功能分区定义，让房屋、公共建筑、广场、练武场、道路和树木避让使用同一份坐标。
2. 保留现有领主府和五位属民的稳定身份、住房绑定；为新增四座房屋分配独立房屋 ID，不增加或复活属民。
3. 同步视觉建筑、权威碰撞、导航点、门前道路、植被净空和室内雨水遮挡。建筑入口必须能走入，练武场中央和广场必须能横穿。
4. 道路在真实地形着色中同步调整。核对当前地形 GLB 缓存/版本，避免新布局叠在旧道路上。
5. 增加存档布局版本迁移。保留已有游戏进度、人物属性和资源，仅处理新建筑覆盖的角色位置、旧住房目标和旧路径，迁移幂等；应用前备份 SQLite。
6. 复用现有模型加载和释放模式，新资产保留来源任务、实际费用和预览；重复民居共享资源，确保不会重复拉取九份相同文件。

## Tripo 生成批次

本地检查结果：2026-10-15 中国站 `cn`、profile `default`、余额 360、冻结 0。三条确切生成命令已通过 `--dry-run --json`，无警告或参数错误。

共同参数：CLI `tripo-v3.1`，API 模型 `v3.1-20260211`，目标面数 20,000，`texture=true`、`pbr=true`。直接使用 GLB，不额外执行转换、重拓扑、绑定或付费细化。

| 次序 | 任务名 | API 调用 | 预计费用 |
| --- | --- | --- | --- |
| 1 | village-training-ground | POST /v3/generation/text-to-model | 20 积分 |
| 2 | village-warehouse | POST /v3/generation/text-to-model | 20 积分 |
| 3 | village-weaponsmith | POST /v3/generation/text-to-model | 20 积分 |

本批预计总计 60 积分，预计剩余 300。最终以任务账单为准；失败任务退还冻结额度。效果不合格不自动重新付费生成。

生成输出父路径：`public/assets/models/village-expansion`。CLI 在其下创建 `tripo-out/<name>-<id8>/`，包含 GLB、preview.png 和 task.json。检查通过后分别落在 `public/assets/models/valley/training-ground/`、`warehouse/`、`weaponsmith/` 下，并保留任务记录和预览。

### 1. 练武场输入

```text
Ancient Chinese fortified village martial arts training ground prop set, cohesive realistic stylized game art, weathered timber and muted grey stone, rectangular low stone curb with large EMPTY flat packed-earth center, weapon racks and wooden practice dummies arranged ONLY along the back and side edges, small archery targets at rear, completely open front and center, no people, no buildings, no roof, no tall perimeter wall, no text, isolated asset
```

### 2. 仓库输入

```text
Ancient Chinese fortified village warehouse, realistic stylized game building matching grey tiled roof Chinese cottages, weathered dark timber beams, warm cream plaster walls, broad single storey rectangular storehouse, blue grey curved tiled pitched roof, wide central open entrance facing front, stacked grain sacks and wooden crates at sides of entrance, stone foundation, restrained traditional architecture, intact functional building, isolated asset, no people, no text, no courtyard or landscape
```

### 3. 兵器铺输入

```text
Ancient Chinese fortified village weaponsmith shop, realistic stylized game building matching grey tiled Chinese cottages, weathered dark timber frame and warm cream plaster, grey curved tiled pitched roof, single storey forge workshop with broad open front bay, small stone furnace and chimney at back, anvil and workbench, orderly rack of ancient Chinese spears and swords along side wall, restrained details, intact building, isolated asset, no people, no flames, no text, no landscape
```

每个输入使用：

```text
npx tripo-cli@latest make <上列输入> --model tripo-v3.1 -p face_limit=20000 -p texture=true -p pbr=true --name <对应任务名> -o public/assets/models/village-expansion --json --yes
```

## 实施顺序与验收

1. 用户一次确认整体布局与三项生成费用。
2. 执行付费生成，逐个检查预览和实际模型结构、尺寸、材质；记录任务 ID 与实际账单。
3. 统一调整地图定义、房屋点位和公共建筑、道路及植被避让，接入新 GLB。
4. 完成碰撞/导航/雨水遮挡和存档迁移回归，备份后更新当前服务。
5. 浏览器桌面视角检查：全村俯视和参考图分区一致；红区练武场、蓝区仓库、绿区兵器铺可清晰辨认；九栋民居位置正确；广场无树木或旧建筑占据；寨门至领主府通行连贯。
6. 角色实走验证门洞、支路、广场和练武场；重开页面检查模型加载、保存恢复和控制台错误。

风险边界：生成式模型的门洞和内部结构需实际检查，API 成功不等于可以直接通行。若需调整适配，保留完整来源模型并用现有适配层处理；不把整栋建筑设为实心碰撞盒。
