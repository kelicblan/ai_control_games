# 篝火环境展示验证

后续用户已要求世界永不自动结束；本记录中的“死亡仍会失败”规则已由 `validation-never-ending-world.md` 所记录的变更取代。

2026-10-14。用户最终要求：篝火保留，无木材就熄灭，有木材就亮，不再影响游戏进程。

## 已实现

- 木材库存大于 0 时火势派生为 100，否则为 0。创建、命令、模拟步末和恢复存档同步；采木入库当步即亮。
- 不自动消耗木材，不需要添柴。移除任务栏、E 快捷键和天气协商中的添柴入口；篝火场景标记只展示状态。
- 解除熄火失败、夜间失血、健康恢复与士气门槛、火势评分、紧急重排和灼伤危险。其他生存及死亡规则保留。
- 保留旧 MLP 的输入/输出维度；火势槽固定为 1，守火人数和命令槽固定为 0，fire 不在合法动作中。真实显示状态仍保存在 context，历史决策不重写。
- 旧添柴任务和协议取消。仅旧版确切熄火失败且全部伙伴存活的存档恢复为 paused，不补算旅程结束后的时间；点击继续再推进。
- 隐藏旧守火技能的编辑字段，保留模板、导入和存档字段。更新指南、开局、天气、结算说明和 README。

## 验证

- 修改前全量 525/525 通过；工作目录中同时有其他地形、场景及测试改动，最终全量增加到 541 项。
- 新增测试最初 6 项全部失败，实施后通过；扩展后 8 项通过。
- 最终相关验收：11 个文件，244/244 通过。覆盖模拟、篝火、长期世界、SQLite 重启恢复、社交、天气、设置及存档。结果：`data/campfire-acceptance.json`。
- 最终 `npm run build` 成功，保留大包体警告；`git diff --check` 通过。
- 只读最终审查未发现实质问题；发现旧守火技能入口后已隐藏，设置相关 21 项测试通过。
- 本地 18081 服务健康检查项目路径正确且 errors=0。浏览器 5173 已继续旧存档，显示第 2 天、篝火“燃烧”、四项任务且无添火入口；模拟时间继续推进。截图：`docs/screenshots/cosmetic-campfire.png`。无木材熄火及当步重新亮起由自动化测试验证，未人为清空用户现有存档的木材。

## 全量未通过项

最终全量 538/541，保留以下 3 项失败，未将全量标记为成功：

1. `physics.test.ts` — keeps the river hazardous as it passes the map edge at y=3。
2. `physics.test.ts` — keeps the river hazardous as it passes the map edge at y=97。
3. `world-http.test.ts` — advances without any clients, survives a hard process kill, and rejects stale writes：等待 1300ms 后快照仍只有 1 份；独立重跑仍失败，未验证通过该项后台持久化时序要求。

前两项是河道可走判定断言；本次没有修改河道实现或这两项断言。结果：`data/campfire-full-final.json`。

## 数据与运行边界

首次修改服务代码前，使用 SQLite backup API 创建 `data/world-before-cosmetic-fire-20261014.sqlite`。没有清空世界、替换用户存档或重训模型。重新启动本地世界服务加载规则，使用原 `data/world.sqlite`。没有提交或推送；保留其他进行中的改动。
