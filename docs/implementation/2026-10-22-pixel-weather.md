# 二维天气表现修复

## 原因与修改

二维外部地图模式跳过旧三维 ApplyWorldState，旧雨粒子、太阳光和闪电光照没有作用于二维 unlit 地图。此前只接入风力，天气标签虽来自正式快照，画面并无雨幕。

增加 PixelWeatherView 和独立 PixelWeather 着色器：相机尺寸的天气层位于地图上方、原有屏幕 UI 下方；真实 rainIntensity 控制移动雨线，weather/cloudCover 控制平滑压暗，新增 lightningAt 事件触发短暂闪光及折线闪电。初始快照和切换世界不重放历史闪电，轮询收到新事件时保留短暂可见时间，避免错过过短的旧光照窗口。

NativeGameAudio 在 ExternalMapMode 下读取正式 EnvironmentPresentation.audio；沿用既有雨声、雷声与静音偏好，不自动解除静音。不修改天气规则、存档格式或玩家数据。

## 验证

- Unity EditMode 14/14：`native/Artifacts/tests/21aa08d1ced94d43892b64c32adab4ee/results.xml`。
- Windows IL2CPP 构建成功，0 errors / 0 warnings：`native/Artifacts/pixel-build-20261022-092628-d49f6ad5/build.json`。
- 默认启动器校验源码指纹：`e19a244a46f90393eda292636acfeaf9ff269ac99833c4cd5dcd89422565455f`。
- 原生 Direct3D11 GPU 检查 rainMoves、stormDarkens、lightningBrightens 全通过，原有树木/河水检查亦通过：`native/Artifacts/pixel-weather-20261022/gpu/environment-motion.json`。
- 正式存档只读 VACUUM 副本运行，正式天气 API 切换雨/雷暴。快照 rainIntensity 分别为 0.7454 / 0.8348，雷暴产生 lightningAt=3225.3。证据：`native/Artifacts/pixel-weather-20261022/formal-1792632508461/weather-authority.json`。
- 已查看同目录 `01-village.png` 与 `02-common-space.png`：雨线可见，雷暴地图变暗，原有 UI 可读。闪电瞬时图像由 GPU 检查验证，未宣称在整图截图捕捉到闪电。未做真人听觉验收或完整性能基准。
- 验证保持静音偏好，关闭本次持有的测试客户端与隔离世界服务；不修改正式存档。
