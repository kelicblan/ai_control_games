# 建筑与人物保留资产包

当前地图方案已停止，等待用户提供新的地图设计原图。本包只整理可供新地图继续使用的建筑生成原件和已有游戏人物，不包含旧地形、旧布局或样板修补模型。

共 **14个模型：4个建筑原件、10个人物（领主及9名属民）**。所有GLB均验证文件结构、内嵌资源及SHA256；人物另检查骨骼和Idle/Walk动画。新地图中的视觉效果和行为仍需重新接入验收。

| 资产 | 包内文件 | 三角面 | 状态 |
|---|---|---:|---|
| 领主宅 | buildings/manor/model.glb | 73,730 | 生成原件，待新图复核 |
| 民居 | buildings/dwelling/model.glb | 44,078 | 生成原件，待新图复核 |
| 寨门 | buildings/gate/model.glb | 48,239 | 背景污染，须重做/清理 |
| 瞭望塔 | buildings/watchtower/model.glb | 45,073 | 生成原件，待新图复核 |
| 领主（lord） | characters/lord/model.glb | 28,776 | 已有骨骼；Idle、Walk |
| 阿壮（azhuang） | characters/azhuang/model.glb | 14,328 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |
| 小米（xiaomi） | characters/xiaomi/model.glb | 14,884 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |
| 老周（laozhou） | characters/laozhou/model.glb | 14,284 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |
| 林枫（linlan） | characters/linlan/model.glb | 14,464 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |
| 阿野（aye） | characters/aye/model.glb | 14,274 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |
| 铁生（tiesheng） | characters/tiesheng/model.glb | 14,466 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |
| 阿绫（aling） | characters/aling/model.glb | 14,533 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |
| 小满（xiaoman） | characters/xiaoman/model.glb | 14,491 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |
| 沈砚（shenyan） | characters/shenyan/model.glb | 14,324 | 已有骨骼；Idle、Walk、Work、Gather、Rest、Carry、WalkCarry |

## 保存内容

- 每个建筑目录：Tripo原始GLB、可用预览、生成任务记录和对应单体参考图。
- 每个人物目录：当前Unity实际使用的GLB，包含已有骨骼及动作，以及当前动画控制器；导入设置另存为文本，避免复制Unity GUID造成冲突。
- animation.controller保留原游戏的动画状态和转换；引用仍对应原项目GUID。重新导入其他Unity项目时，应按GLB动作名称重新绑定动画引用，不能假定复制控制器后引用自动有效。
- manifest.json：逐文件原路径、SHA256、字节数、网格统计、动画名称、生成任务ID和已消耗积分。
- 原有文件未移动或删除，现有Unity资源引用未改动；此目录是经过校验的整理副本。

## 已知问题

- 寨门生成原件混入背景房屋、塔楼及地面，不作为合格独立寨门交付。旧样板的裁切、拼接屋顶和补门扇不混入本包。
- 领主宅、民居和瞭望塔是保留候选，不代表已符合尚未提供的新地图设计。
- 旧地图的固定位置、朝向、非等比适配尺寸、围栏轮廓和初始化坐标均不作为新地图约束。人物身份和动画保留。
- 历史4次Tripo生成共消耗240积分；本次整理不新增生成任务或积分消耗。

## 使用

收到新地图后，优先从本包筛选建筑，复用人物，再根据新图重新规划地形、建筑布局、出生点、碰撞和寻路。
