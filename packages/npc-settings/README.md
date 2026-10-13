# NPC 初始设置：可复用数据与存储合同

本目录是 TypeScript 源码包，不依赖营地、React、浏览器、Node 或具体数据库 SDK。`src/index.ts` 负责目录、默认值和校验；`src/sqlite.ts` 是注入驱动的 SQLite 实现，不包含本机连接。UI 位于相邻的 `npc-settings-react`，浏览器适配器位于 `src/integrations/storage/indexeddb-settings.ts`。

## 接入下一款游戏

1. 定义 `SettingsCatalog`：唯一 `gameId`、整数 `schemaVersion`、角色目录、字段目录和每个角色的默认值。公共层不限制字段必须叫“体力”或“采木”。
2. 创建存储适配器：浏览器可用 IndexedDB；本机或服务端可注入 SQLite 连接；也可实现相同 `SettingsRepository` 接口。
3. 使用公共 React 表单，或为 Cocos/Unity 等宿主实现自己的控件；其他引擎并不能直接渲染 React 表单。
4. 新开局先读取一份已校验文档，把值复制到本局状态。**继续存档不能再次应用初始值**；数据库模板不是运行状态。
5. 游戏将技能映射到真实动作。公共模块不擅自规定烹饪、战斗或采木的效果。

```ts
import { defaultSettings, type SettingsCatalog } from './src';
const catalog: SettingsCatalog = {
  gameId: 'restaurant', schemaVersion: 1,
  fields: [{ id: 'cooking', label: '烹饪技能', group: '技能',
    description: '由餐厅执行层解释技能效果', min: 0, max: 100, step: 1 }],
  characters: [{ id: 'chef', label: '厨师', defaults: { cooking: 50 } }],
};
const draft = defaultSettings(catalog);
draft.characters.chef.cooking = 80;
```

## 数据规则

字段是有限数值，不支持运行脚本或任意属性路径。字符串、空输入、NaN/Infinity、越界、错误步长、重复/未知角色、未知/缺少字段、错误游戏和版本均拒绝；不会为了保存成功而悄悄截断。配置 JSON 不超过 1,000,000 字符，文件导入另有 1 MB 限制。`displayScale` 只改变显示：内部 0..1 可显示为 0..100。

`defaultSettings`、`validateSettings` 返回独立对象。编辑草稿不能修改目录默认值、已保存文档或运行中的角色。用户可先恢复默认，再决定保存还是取消。

`load()` 返回 `{revision, document}`。没有记录时修订号为 0。`save(document, expectedRevision)` 校验全量文档，在一个事务中比较现有修订号并写入整份配置。提交完成才返回新修订号；冲突抛出 `SettingsError(code='conflict')`，调用者保留草稿并让用户重新载入，不自动覆盖。

## SQLite 实现

表为 `npc_settings(game_id PRIMARY KEY, revision, document)`。五个角色作为同一文档原子保存，避免只保存了部分角色。不同 gameId 隔离。SQLite `BEGIN IMMEDIATE` 期间没有 await；数据均以参数绑定，SQL 不拼接用户内容。连接生命周期、文件路径、加密、迁移与备份由宿主负责。

例如宿主选择 Node 的 SQLite 连接时：

```ts
import { DatabaseSync } from 'node:sqlite';
import { createSqliteSettingsRepository } from './src/sqlite';
const db = new DatabaseSync('npc-settings.sqlite');
const repository = createSqliteSettingsRepository({
  exec(sql) { db.exec(sql); },
  get(sql, params) { return db.prepare(sql).get(...params); },
  run(sql, params) { db.prepare(sql).run(...params); },
}, catalog);
const snapshot = await repository.load();
await repository.save(snapshot.document, snapshot.revision);
db.close();
```

本版网页实际使用 **IndexedDB**，不是浏览器内存 SQLite，也不假称已经生成了 .sqlite 文件。SQLite 适配器提供真实数据库落盘、重开、冲突和回滚测试；实际执行范围见 `docs/validation-npc-settings.md`。服务端多用户系统需要宿主按账号隔离数据库/命名空间并做鉴权，不能把本地 gameId 当作访问控制。

## 验证

`npm test -- tests/npc-settings.test.ts tests/npc-settings-camp.test.ts`；`npm run check:npc` 增加此纯包的无 DOM 编译与依赖边界检查。浏览器编辑与持久化流程见 `e2e/npc-settings.spec.ts`。
