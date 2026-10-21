# 最新参考图初始化区域 · 重建记录

> **当前方案已停止。** 用户经专家评审决定更换地图，等待新的地图设计原图。本文及对照页面仅保留作历史记录，不能作为后续新地图的布局依据。已生成建筑及旧人物另整理到`native/ArtSource/retained-buildings-characters-2026-10-17`。

唯一全局参考：用户于2026-10-17选定的最新小型村寨全景，2048×1303。

[规划](../superpowers/specs/2026-10-17-reference-initial-region.md) · [原图标记及渲染叠加对照](review.html) · [建筑候选实际渲染](candidate-fit.png)

## 当前已实现

- 原始参考图固化在`native/ArtSource/reference-initial-region/layout-reference.png`，SHA256为`d563e920f8b724ef482dbacb8ac68ba301c731beaef732e81e26b2dede06bdf9`。
- `constraints.json`包含17组人工初描约束：村寨台地、寨墙落脚线、领主宅、三座主要民居、瞭望塔、河道双岸以及三个显著山体轮廓。标记带可见性和10～28像素误差范围；这不是逐像素完成测量。
- 透视相机投影/反投影支持原始图像像素、相机方位和指定高度平面。TS双精度和Unity实际相机分别检查复投影，且拒绝把地平线方向虚构成地面交点。
- 对照页面保留原始像素，以SVG覆盖标记；支持逐物体显隐、点位调整、JSON导出和实际渲染透明叠加。画幅不一致的输入被拒绝，不靠拉伸截图制造对齐。
- 新建独立`ReferenceRegionCalibration.unity`和校准程序。仅载入此前按单体参考生成的Tripo建筑候选作适配检查，全部等比缩放；未引用旧地图中的地形、寨墙、树木、岩石或桥梁模型。
- 对领主宅、三座民居及瞭望塔联合拟合可见包围范围和屋脊方向，输出实际Windows窗口渲染，分辨率2048×1303。黄色线是测量施工线；平面是暂定相对高度的施工平面，不是已建成的村寨地形。

## 实际结果与未通过项

当前相机只是候选：俯角27.5度，固定测试FOV50度，未完成独立透视和世界尺度校准。

| 候选 | 包围范围边缘RMS误差 | 参考屋脊角 / 候选估计角 | 结论 |
|---|---:|---:|---|
| 领主宅 | 11.04px | 12.96° / 6.92° | 屋顶方向及轮廓仍不同，未接受 |
| 左侧民居 | 5.91px | 12.77° / 10.21° | 仍需屋顶轮廓、门廊、尺度复核，未接受 |
| 前部民居 | 8.18px | 26.57° / 23.33° | 仍需轮廓和构造修正，未接受 |
| 右侧民居 | 7.39px | 20.11° / 18.60° | 遮挡区及外形仍需复核，未接受 |
| 瞭望塔 | 3.83px | 不使用屋脊轴约束 | 须检查塔身结构、比例和真实屋顶轮廓，未接受 |

上表是粗描范围的拟合误差，不是整栋建筑逐像素误差，更不代表还原百分比。屋脊估计来自网格顶部区域的主轴，仍需精确屋脊顶点复核；当前不能依赖该估计确定最终朝向。

目前还没有重建完整山体、河床、台地、寨墙和环境，也没有把该校准场景作为新主游戏初始化。旧版游戏及修订6不因此变为合格成果。

## 不能从当前图直接确定的内容

1. 台地相对河面的真实高差、岸坡隐藏断面、相机距离和世界尺度的组合。
2. 主体山体的背面、后侧谷地及岩体厚度。
3. 被建筑和林木遮住的寨墙连接、入口和寨门完整轮廓。
4. 右侧小屋顶对应的完整构筑物数量、占地和用途。
5. 林冠下的地面通路、室内格局及不可见桥梁是否存在。

用户已明确允许在可见布局不变的约束下推算未知区域，所有推断项必须标明并以实景对照验收。这不授权改动可见布局。

## 地形重建实施中

新增`inferred-terrain.json`记录七组参考山体层次、推断深度、村寨/河面相对高度及来源。`ReferenceRegionTerrainBuilder`重新生成河谷、台地、河道和寨墙体块，未使用旧地形坐标、旧山脊链或旧环境网格。

可见山脊为硬约束，深度推断只能修改它们之间及背面的坡面。回投检查已扩展到实际导出三角网格，不能仅用解析高度公式自证对齐。测试同时检查村寨地面、河床与Unity实际碰撞地面一致，且不写入主游戏场景。

当前水面相对村寨为-18个世界单位，是明确标记的推断值，不是从图片精确测量的事实。山体背坡同样是待实际对照调整的推断形体。

## 本轮验证

- TS参考绑定、真实PNG尺寸、透视复投影、非法标记、屋脊约束及未确定寨门边界：5/5通过。
- 新增脚本的严格TypeScript检查通过。
- Unity投影专项：2/2通过。首次观察到接近地平线处约0.088px漂移，改用相机基向量构造射线后通过0.003px门槛。
- Windows校准程序构建成功，实际渲染输出存在且画幅为2048×1303；日志未发现该次运行异常。
- 浏览器交互验收尚未执行：内置浏览器连接报告`privileged native pipe bridge is not available`。对照页已生成，但不把生成成功记为浏览器交互通过。
- 本轮没有新增Tripo付费任务。

相关证据：

- `native/Artifacts/tests/e698318e4cbf4f1aa8df0b69597d3666/results.xml`
- `native/Artifacts/reference-region-build-ee788c5c98414e9aa7a9516939a2be4a/editor.log`
- `native/Artifacts/reference-region-capture-f207e926962541279732bd9e63fdc7ed/fit-report.json`
- `native/Artifacts/reference-region-capture-f207e926962541279732bd9e63fdc7ed/candidate-fit.png`

## 重现

在Unity工作区执行：

```powershell
npx vitest run tests/reference-initial-region.test.ts --maxWorkers=1 --minWorkers=1
./scripts/unity/reference-region-calibration.ps1 -Action Build
./scripts/unity/reference-region-calibration.ps1 -Action Capture
node --import tsx scripts/reference-region/build-review.ts <实际捕获目录>/candidate-fit.png
```

这些命令生成校准资料，不会启动权威世界服务，也不代表新区域已经完成正式游戏接入。
