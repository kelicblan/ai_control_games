# 参考图可行走样板 · 首版验收记录

日期：2026-10-17。四项Tripo建筑已接入独立Unity原生场景，复用现有骨骼人物，可以观察、行走和开合寨门。当前为建筑与通行样板，**视觉尚未达到参考图，不能作为整张地图还原完成的结论**。

## 启动与操作

[双击运行参考图样板.cmd](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/运行参考图样板.cmd)；程序在 native/Builds/ReferenceSample/CampMindSample.exe。

- 1～6：总览、领主宅、民居、寨门、瞭望塔、河岸固定机位。
- Tab：切换行走镜头；WASD移动；右键拖动环绕；滚轮调距离。
- 靠近寨门按E开合；Home回出生点；H隐藏说明；F12截图。
- 独立场景不连接TS世界服务、不写玩家存档，未替换Camp主地图。房屋室内、塔楼攀爬和正式世界寻路尚未验收。

## 实际费用

| 资产 | 操作 | 任务ID | 实际积分 |
|---|---|---|---:|
| 领主宅 | image_to_model | 8395bc02-e709-4ccb-8547-143bd1233fb4 | 60 |
| 民居 | image_to_model | c2c2c17f-f595-4140-88e6-bcacc7be3db2 | 60 |
| 寨门 | image_to_model | 28906808-2155-4cc3-b7ae-20e6da5f5eed | 60 |
| 瞭望塔 | image_to_model | 151bf4b6-c873-4e54-9e48-cc022d758144 | 60 |

总消费 **240积分**；四项各60积分。生成后查询余额3050、冻结0。没有付费重生成、转换、分割或角色生成。源文件与SHA256见Unity样板目录中的sources.json。

寨门原始结果混入背景建筑与地面，做了本地裁剪、去除无引用顶点及复用本次瞭望塔屋顶修补。开合门板使用本地建模与程序化木纹重建；原始付费GLB未覆盖。修补结构仍需视觉验收。

## 验证证据

实际渲染窗口探针：D:/workspace_zsfz/ai_control_games/ai_control_games_unity/native/Artifacts/reference-sample-bff27c86043a4492a88eeba0bbed08e5。
人物运动距离约214.8米；9根骨骼有姿态变化；9段路线均到达目标。地面支撑=true，障碍穿透=false，关门阻挡=true，开门通路=true。

Unity专项EditMode检查4/4通过；真实Windows Player构建及窗口截图已完成。没有运行全项目测试、正式世界联调或长期性能基准，通行结果仅覆盖记录的样板路线。

## 固定视角对照

相机按参考图方向与主体构图近似设置，并记录位置、目标点与FOV。单张参考图没有原始相机参数，以下不是像素级标定或完全相同机位的证明。

| 对象 | 参考图片 | 实际Unity窗口截图 |
|---|---|---|
| 总览 | ![总览参考](D:/workspace_zsfz/ai_control_games/模型/模型原图/晨曦群山中的古风山寨.png) | ![总览实际](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-sample/screenshots/overview.png) |
| 领主宅 | ![领主宅参考](D:/workspace_zsfz/ai_control_games/模型/模型原图/领主宅.png) | ![领主宅实际](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-sample/screenshots/manor.png) |
| 民居 | ![民居参考](D:/workspace_zsfz/ai_control_games/模型/模型原图/属民屋.png) | ![民居实际](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-sample/screenshots/dwelling.png) |
| 寨门 | ![寨门参考](D:/workspace_zsfz/ai_control_games/模型/模型原图/围栏和寨门.png) | ![寨门实际](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-sample/screenshots/gate.png) |
| 瞭望塔 | ![瞭望塔参考](D:/workspace_zsfz/ai_control_games/模型/模型原图/瞭望塔.png) | ![瞭望塔实际](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-sample/screenshots/watchtower.png) |

## 河岸与实际行走

![河岸](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-sample/screenshots/riverbank.png)
![行走后位置](D:/workspace_zsfz/ai_control_games/ai_control_games_unity/docs/reference-sample/screenshots/walk.png)

## 仍有的视觉差异

- 四栋建筑主要轮廓和装饰已生成；木构细节、屋顶厚度、零散道具、背面和部分材质仍有AI生成误差。
- 样板山体为程序化占位，植被、围墙与石块复用旧资产，风格和密度与原图不一致。
- 台地、峭壁、复杂河谷、瀑布急流、山谷云雾与地表生活细节未达到原图。
- 总览布局只覆盖样板构图，不能视为完整参考地图的地理复刻。
- 未将当前画面标记为visualAccepted；后续应先对上述差异继续制作，再决定是否扩展全图。

## 相机参数

| 机位 | 位置 | 目标 | 垂直FOV |
|---|---|---|---:|
| overview | 74, 55, -100 | -10, 8, 12 | 49 |
| manor | 9, 10, -10 | 0, 8, 12 | 52 |
| dwelling | -6, 9, -24 | -18, 6, -8 | 52 |
| gate | 27, 11, -65 | 12, 8, -40 | 52 |
| watchtower | 48, 16, -14 | 30, 11, 13 | 52 |
| riverbank | -26, 19, -85 | -65, 1, -30 | 52 |
