# 原版界面还原

用户于 2026-10-17 明确要求 Unity 界面与之前一致。此前常驻宽伙伴列表、右侧整列频道、全宽任务按钮和展开的实验开局面板不符合这一要求，不能作为迁移完成结果。

## 对照来源

- `src/components/Header.tsx`：品牌、物资、时间、播放与设置/声音/帮助工具。
- `src/components/CrewPanel.tsx`、`src/styles/nine-villagers.css`：九名伙伴双列头像、名字、状态条。
- `src/components/CommandDock.tsx`、`src/App.tsx`：头像点击切换任务栏；地图/数字键选择不自动展开任务栏；派遣、伐木、采食、休息、互助、狩猎六项。
- `src/styles/compact-hud.css`、`src/styles/world-channel.css`：边缘 HUD，左下 320px 世界频道、竖排页签，底部短任务栏、右下手记与营地入口。
- `src/components/JourneyDialog.tsx`、`src/styles/dialogs.css`：620px 开局窗口、原始插画/文案、三个生活节奏、默认收起的模型/场景/种子设置。

原版头像 SVG、头像图集和 Lucide 图标通过 `scripts/export-unity-hud.ts` 导出为 Unity 本地贴图，未重新设计角色形象。导出的资源随工程保存；普通构建无需图像转换工具。重新导出需要 React/tsx 与 Sharp（可用 `CAMPMIND_IMAGE_PACKAGES` 指定依赖目录）。

## 验收边界

功能测试通过只证明操作链路，不能证明像素一致。须检查实际 Player 的开局、常态 HUD、选中伙伴、频道、社会和地图截图。原生对话框、模型设置、记忆和营地详细页仍需继续按原组件逐页还原；当前不能签署“所有界面一模一样”。世界渲染/任意种子、旧档导入及 C# 权威迁移不因本次 HUD 修正而完成。

## 本次验证

EditMode `89a317d78cc94b5da14f25df5092ef2a` 为52/52；TypeScript无输出检查通过。IL2CPP `7d94fed6ae864d49a829d3913e915c13` 的实际窗口流程 `slice-2f50187c-5d68-4261-a671-92b3c5feb358` 通过11项：开局、暂停、派工、寨门、天气、合法社会回复、历史、未保存配置保护、地图不扩探索、音效切换和角色运动。开局与常态截图已检查。

首次改版探针曾发现弹窗关闭后的任务栏恢复迟滞（`slice-88d7a436-7bce-4d9c-9081-591e357ecc63`），已改为关闭时同步恢复；小标签字体裁切也已修正。随后另外修正高级设置展开时内容顶部偏移；最终构建为 `Camp-IL2CPP-cd30faa32f254485ab7f71bb83c0a127`，最终窗口回归另记。截图是原生Player输出，按钮射线探针与程序点击回调不等于人工鼠标逐项验收。

最终窗口回归 `slice-56c996e9-49ff-4d67-83e2-7b6e2a607b61` 同样11项通过，常态截图已检查。界面不再常驻全宽任务栏；还原验收仍保留上文的逐页/像素边界。
