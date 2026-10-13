# 通用 NPC 设置表单（React）

`src/Editor.tsx` 导出 `NpcSettingsEditor`，只依赖 React 和 `npc-settings` 数据合同。不含营地角色 ID、具体技能或游戏引擎调用。当前以源码方式导入，由宿主构建器处理 TSX/CSS。

```tsx
<NpcSettingsEditor
  catalog={yourCatalog}
  repository={yourRepository}
  onCancel={closeWithUnsavedGuard}
  onDirtyChange={rememberWhetherDraftChanged}
  onBusyChange={rememberWhetherSaving}
  note="保存后只影响新的游戏，继续存档不变。"
/>
```

目录定义角色切换项、分组、标签、默认值、范围、步长和说明。表单提供滑块、数字输入、当前/全部恢复默认、JSON 导入导出、保存和错误反馈；导入与恢复默认都先进入草稿。非法文本会阻止保存，不会默默变成 0。

宿主负责窗口、暂停/恢复游戏，以及关闭/Esc 的未保存提醒。使用 `onDirtyChange` 与 `onBusyChange` 统一保护所有关闭路径；保存中不要卸载窗口。成功保存不关闭窗口、不创建新局，也不改变当前 NPC。存储异常不会被伪装成“已保存”；冲突后需用户明确重新载入。

样式全部限定在 `.npc-settings` 下。小屏幕角色选择横向滚动，字段和数值不横向溢出，底部操作栏保持可达。控件包含 label、范围、说明、错误状态与状态播报。

这是可复用的 **React/Web 界面**，不是不加适配就能用于所有原生引擎的 UI。Unity 等可复用数据/存储合同的设计并提供本引擎控件。
