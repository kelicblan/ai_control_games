# 绿色缺口与寨门接地修正

本次以用户标注的范围为准：新增石阶用于下方绿色缺口，连接村寨地面与原平台边缘；主殿本身的台阶、门廊及平台不再覆盖或裁切。前一步将新楼梯延伸至门廊的方案已撤销，旧的“能够走到门廊”报告不能作为布局正确的证明。

## 已实施的范围

- 主殿 `hall(Clone)` 恢复引用原来的 `corrected-H-0.asset`；原模型的台阶、平台、贴图及手调朝向恢复。
- 停用被否定的整段高楼梯、宽大平面、上平台接合踏步和隐藏铺面。
- 复用已付费的石阶 GLB，仅适配原 `main-stair-0` 至 `main-stair-27` 的预留缺口。下端约 `(12.15, 4.50, 34.38)`，上端约 `(18.69, 11.85, 42.10)`，宽 13 米；上端对齐原主殿自带台阶的下沿，不延伸至门廊。阶脚按实际周边地面接齐，撤销原推断的低洼底部。第一次放在左前方的短阶已停用。本次新增 Tripo 消耗为 **0**。
- 恢复连接处原有地形纹理和岸坡面，再针对下方石阶处理局部边缘。没有重建整张地图或重新排列建筑。
- 寨门内侧、门洞、桥头采用连续地形网格，消除旧补片造成的空洞、尖刺和重叠面。桥面通行碰撞按现有木桥可见表面补齐，不移动木桥模型。
- 清理木桥桥面范围内残留的旧地形三角面；桥下局部缺失水面沿用现有河流材质，并按邻近水面高度补续。该水面补片的遮挡区边界属于推断项，不代表重新确定整条河道。
- 寨门、主殿、瞭望塔和其他原有物体 Transform 不变。启动包使用独立构建目录，避免覆盖正在运行的旧游戏。

## 正式场景与保留资料

- 正式场景：`native/CampMind.Unity/Assets/CampMind/NewWorldGame/Camp.unity`。
- 派生资源：`Assets/CampMind/NewWorldGame/ConnectionCorrection/v2/`。
- 修正前完整副本：`Assets/CampMind/NewWorldGame/ConnectionCorrection/Before-correction.unity`。
- 原主殿恢复依据：`Assets/CampMind/NewWorldGame/StairsRepair/Before-20261017-214441.unity`。
- 原接地处理之前的岸坡来源：`Assets/CampMind/NewWorldManualRepairs/20261017-201720/before-local-joins.unity`。
- 范围与保护检查：`native/Artifacts/connection-correction/restored.json`、`correction.json`。
- 场景预览：同目录 `green-stair-corrected.png`、`gate-corrected.png`、`corrected-hall-top.png`。

## 验证方法

`node scripts/unity/verify-connection-map.mjs` 使用正式世界服务的实际高度、碰撞网格，检查出生点至绿区阶脚、石阶至原平台边缘，以及寨门到桥面的连续通行。相关模拟测试单独运行，不与视觉验收混为一谈。

陡石阶使用从实际通行碰撞面采样的 241 点高度曲线，在楼梯走廊内插值，避免半米网格取整形成假的断崖。通行仍检查碰撞格，不放开其他山崖、河流或建筑。原主殿自带台阶按原模型表面取高补充隐藏通行面，并在验收终点之外保留充分的脚步支撑余量，避免角色越过新阶顶时掉入底层地面；该处理不改变红区可见模型。回归测试包含阶面插值、普通断崖和楼梯内障碍阻挡。

实机诊断在 UI 布局完成后进行真实射线命中检查，再分发 Unity 指针点击事件进入村寨；行走通过 `NativeCampView` 的 Input System W 键链执行，不瞬移角色：`--stair-probe` 验证绿区石阶和原台阶下沿，`--gate-probe` 验证出寨、过桥及落到对岸。入口事件测试不等于操作系统级鼠标注入验收。测试使用隔离存档；用户原存档只读核对，无重置。

本次验证不代表整张地图已与参考图完全一致；最终实机结果及包路径记录在 `native/Artifacts/connection-correction/delivery.json`。
