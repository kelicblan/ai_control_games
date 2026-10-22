# 树木轻摆可见性修复

用户在实际游戏中反馈树木没有动。只读检查当时运行的新二维客户端及其正式天气快照：weather=wind，windStrength=0.633894，windAngle=5.027933。旧位移 `.48 * wind` 又将纵向分量缩小到 `.22`；该风向在常用缩放下的最大可见位移不到一个像素。之前的高风力近景合成 GPU 检查不能证明地图中的实际树木可辨认地摆动。

修复：按相机世界单位/像素计算最大 5 像素的风力比例幅度，世界单位上限 1.5；对二维投影风向归一化，避免接近纵向的风向几乎不动。继续平滑实际风力变化，根部顶点固定，零风不摆，不修改权威位置、资源和碰撞。

原生 GPU 探针增加实际 `oak` 树资源、8 米显示宽度、1100 像素/310 世界单位的等效视口，以及用户报告时的实际风向/风力。结果 actualTreeChanged=302，actualTreeRootChanged=0；原有零风静止、水纹、雨幕、雷暴和闪电检查全部通过。证据 `native/Artifacts/tree-wind-visibility/gpu/environment-motion.json` 及 `actual-oak-a.png` / `actual-oak-b.png`。该检查使用真实树资源的离屏渲染，不等同于整图人工动态观感验收。

最终 Windows IL2CPP 新包：`native/Builds/PixelGame-20261022-095733-acfda51f/CampMind.exe`，0 errors / 0 warnings，源码指纹 `bebfbb37e465e8ac2e93a1e5cef748c822a4b30d50e50faccf83af16a538b264`。默认启动器校验通过。此包同时包含本次已完成的九名 NPC 差异外观和区域野生动物改造。没有关闭用户或其他任务持有的游戏进程。

## 用户观感反馈后的第二次幅度调整

用户仍觉得摆动太小，故将风力比例上限从 5 像素提高到 12 像素，世界单位上限从 1.5 提高到 3.5，常用桌面缩放下约为上一版 2.4 倍；频率和平滑过渡不变。用户此前风力 0.63 时峰值约 7.5 像素，仍受风力控制而不是持续固定幅度。

更新原生包 `native/Builds/PixelGame-20261022-100610-d062a2dd/CampMind.exe` 构建成功，0 errors/warnings，默认启动器指纹 `b1f6d02278e0610ecb6fbea3e4f444e77a0f4126d92933bd508689e672b9b7fa` 校验通过。`native/Artifacts/tree-wind-visibility/stronger-gpu/environment-motion.json` 全部通过，实际树资源两帧变化 437 像素，根部变化 0；原有天气和水流检查也通过。

## 用户反馈静止后的生产路径调整

用户再次反馈树木不动。本轮没有把旧离屏检查当作当前症状已解决：新增 `PixelTreeRuntimeProbe`，在真实分块、正式天气快照和实际 SpriteRenderer 上检查。旧实现的真实场景风力与动画时间均有更新，显式渲染请求中也有变化（`native/Artifacts/tree-runtime/run-1792635242621/tree-runtime.json`），因此没有证据将问题归因于风力未传递，也没有证明用户当时屏幕的确切静止原因。

生产树木现改用 `PixelTreeSway`，按正式风力平滑值、实时时钟和固定位置相位直接驱动根部 pivot 的 Z 轴轻摆。生成树木时关闭该实例的着色器树冠变形，避免双重摆动；碰撞、资源位置不变。视口分块关闭时组件自动停止更新。

验收改为正常游戏 backbuffer 的 ScreenCapture，两次截图均未调用 SubmitRenderRequest；在隔离正式存档中设置有风、相机固定在真实森林，短暂隐藏 QA 画面的 UI/雨幕以排除覆盖和雨线干扰。`native/Artifacts/tree-runtime/run-1792635565161/tree-runtime.json`：风力 0.666，旋转 353.30° -> 1.60°，约 1.6 秒相差 8.30°，树冠变化 1013 像素，rootStable=true。对应 `tree-map-a.png` / `tree-map-b.png` 为正常游戏渲染截图。

Unity 测试 16/16：`native/Artifacts/tests/c432e24a602d4732a6dd715022739db5/results.xml`。交付构建 `native/Builds/PixelGame-20261022-101803-85fde82e/CampMind.exe`，0 errors/warnings，默认启动器指纹 `a48e23368620438b571369c1c22b46be8379799acbf3a7a1cb58296671e7c3ac` 校验通过。只关闭本次验证客户端和隔离世界服务，没有改写正式存档或结束其他任务的游戏。
