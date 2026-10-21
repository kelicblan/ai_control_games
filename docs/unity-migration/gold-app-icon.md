# 黄金包边程序图标

用户要求 Windows 程序图标四个角改为圆弧，周围增加黄金包边。

交付素材：`native/CampMind.Unity/Assets/Resources/Branding/app-icon-gold.png`，使用内置 imagegen 编辑原始 Logo，圆角外透明。独立用于 EXE 所需的全部图标尺寸；启动文字仍使用透明字样。

提示词：Preserve the original central artwork and Chinese title 一寨之主. Change only the silhouette and border to a rounded square with four arc corners, a continuous thick metallic gold beveled frame, highlights and a dark gold recessed inner edge. Clip the artwork inside the frame, with transparent alpha outside the corners. Straight-on square RGBA icon, no extra text or symbols.

验证：Windows Release IL2CPP 构建成功，记录 `native/Artifacts/builds/1d5fcbcd9788401b9550cf753202f67c`。已从最终 `CampMind.exe` 实际提取程序图标，确认金色边框及透明圆角；提取结果 `native/Artifacts/gold-executable-icon.png`。项目全部 8 个 Standalone 图标槽位引用新素材。
