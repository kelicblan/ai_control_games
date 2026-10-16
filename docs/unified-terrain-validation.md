# 初始区域整体地形 · 2026-10-14

用户已确认“整体地形GLB＋动态河水＋独立建筑植被”方案。此次替换了旧的环状平滑抬升、等宽河带与悬浮矩形道路，保留领主府、五座民居、木寨、塔和存档。

## 已接入的实际资产

- `public/assets/models/valley/terrain/model.glb`：2,304米见方，452,929顶点、903,168三角面、34,392,568字节。一个连通的索引地形网格，包含山脊与支脉、鞍部、坡脚、河床和融入地表的磨损土路。村寨及近山区域使用2米网格，外围使用8米网格，过渡共享顶点；坐标单位为米。
- `terrain/manifest.json`：布局版本3、网格范围与精度、顶点/三角面/字节统计。可用 `node --import tsx scripts/build-valley-terrain.ts` 重建。
- `terrain/bedrock-albedo.png`：使用内置imagegen生成的自然岩面材质，已复制到项目内；运行时通过三平面映射绑定到真实地形，避免陡坡纹理纵向拉伸。GLB保存基础顶点材质，游戏中的岩面细节由此PNG与运行时材质提供。

这不是Tripo生成的新山脉模型，也不是合并旧石堆。山地与河谷使用可控的连通山脊和排水曲线建模后实际导出GLB。没有新增Tripo付费请求。河水保留独立动态网格，以便流动、波光和桥梁通行。

## 地理与通行

河道包含多次弯曲、宽窄变化与自然坡岸，撤掉沿两岸等间距排列的大石块。岸坡从实际水线起坡，不再在水面旁留下低于水面的干沟。

村外主路经寨门、桥梁向河谷延伸到初始探索圆之外。所有424个道路采样点均已核对水域；寨门外全部连续路段可通行，只有明确桥梁处跨水。道路在植被生成时留空；三个初始区域常规桥梁均验证了完整桥面及两侧接坡。寨内中央火堆仍是需要绕行的实体，环形广场提供通路。

人物高度使用GLB同一自适应网格、同一三角划分的重心插值。测试直接对导出的GLB射线求交，验证人物采样高度吻合。渲染加载模型后，覆盖区域不会再生成第二层地面；网格边界与128米世界块对齐。

存档布局升级为版本3，仅修复局部新增水域或障碍中的位置和路线，保留身体、资源、历史和远方坐标。旧版1、2和无版本存档仍可读取；未知未来版本保留原文件并拒绝静默重建。

## 验证结果

- 生产构建 `npm run build` 通过；仍有大包体积提示。离线缓存包含104个同源文件。
- 最终专项检查：9个文件、197项全部通过，见 `unified-terrain-scoped.log`。
- 全量检查：56个文件、544项，其中543项通过；剩余1项为 `tests/engine.test.ts` 中持续生存模拟超过5秒，见 `unified-terrain-full-test.log`。没有宣称全量全部通过。
- 一次独立代码审查发现道路入水、远处桥头落差两项问题；均补上先失败后通过的回归检查并修复。
- 浏览器确认显示“整体地形GLB已加载”，岩面纹理已加载，未发现着色器错误；实测视角与并发负载下约24至60 FPS，具体依设备和同时运行任务变化。
- 实景截图：`screenshots/unified-valley-overview.png`、`unified-valley-roads.png`、`unified-valley-mountains.png`、`unified-valley-gate.png`。这些是游戏运行画面。

预览：<http://127.0.0.1:5180/scripts/valley-preview.html>。采用独立固定昼间状态，不覆盖用户的主世界存档。当前仍为风格化地形表现，并非参考插画的像素级复刻。

Windows启动改为隐藏后台进程，取消原生Node watch子进程链。新启动的5180预览和18082验收世界进程均已检查：没有 `--watch`、主窗口句柄为0。既有其他聊天或用户启动的服务未批量结束；Windows后端源码变更需要显式重启对应服务。

最后尝试重启旧验收服务时被自动审批拦截，工具只返回“blocked by policy”，未提供细分原因。该进程未被停止或替换；独立地图验收页面使用本地固定状态，不依赖这个后端。没有重启用户主世界服务。

## 岩面贴图生成记录

使用内置imagegen模式，生成后检查并复制到上述项目路径；未使用API CLI，也未新增Tripo请求。原始输出保留在Codex生成图像目录。

最终提示词：

> Create a production game PBR base-color texture for weathered mountain bedrock in an ancient remote Chinese mountain valley. A single square seamless tileable texture, orthographic macro surface photograph under completely diffuse even illumination. Natural cool grey granite and fractured limestone, irregular angular fissures, chipped mineral grains, subtle earthy brown and faint green mineral staining, realistic fine and medium-scale variation. The image is ONLY a flat albedo material surface covering the entire canvas edge to edge. No perspective, no mountain landscape, no sky, no individual piled boulders, no isolated props, no fabric-like folds, no stripes or repeated geometric pattern, no dramatic baked light or shadows, no text or border. All four edges must tile seamlessly. High fidelity realistic game terrain texture, restrained natural palette.
