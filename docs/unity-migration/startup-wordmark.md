# 启动标题字样

用户于 2026-10-17 要求移除启动画面上的方形海报 Logo，优先仅保留抠出的“一寨之主”文字。

素材：`native/CampMind.Unity/Assets/Resources/Branding/startup-wordmark.png`，2172 × 724，PNG RGBA。使用内置 imagegen 编辑原始 `../logo.png`，透明背景；游戏程序图标及 HUD 原 Logo 不变。

使用的生成提示：

> Extract ONLY the four gold Chinese calligraphic characters 一寨之主 from the provided logo image, preserving the exact existing character shapes, their horizontal arrangement, golden embossed metallic texture, dark outlines and shadows. Remove ALL mountains, architecture, shields, frame, banners, ribbons, gems, ornaments, scenery and all other background elements. The deliverable is just the original four golden words 一寨之主 on a genuinely transparent alpha background, tightly framed as a wide horizontal wordmark with a small transparent margin. Do not invent a new font, change the spelling, add any symbols or add checkerboard/solid background.

启动画面顶部居中，区域宽度为屏幕 30%，高度为 16%，保持素材宽高比。找不到标题素材时不显示标题，不回退到方形 Logo。

验证：原项目 Release IL2CPP 构建成功（`native/Artifacts/builds/2bde7b440df2466d91dacaffe7b44501`）。最终 EXE 启动截图：`native/Artifacts/startup-models-98b6c111-fd50-4424-818f-3dba219c00c8/startup-video.png`；透明文字已正常覆盖视频顶部，没有原方形海报背景，底部进度条正常。实际启动门禁与慢响应视频循环验证通过，运行日志无异常堆栈。
