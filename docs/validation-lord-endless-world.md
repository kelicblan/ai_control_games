# 领主、双视角与长期生存验证

日期：2026-10-14。变更位于现有工作目录，未提交或推送，保留其他进行中的聚落、模型和世界服务改动。

## 已交付

- 独立领主实体、蓝色服饰和王冠、玩家姓名标识及鹰眼标记。
- 第三人称透视跟随与原有上帝视角；按钮或场景中的 Tab 切换，分别保留镜头参数。
- WASD 方向输入通过世界服务，由固定步长模拟按速度、地形、河流、实体障碍和坡度规则计算位置。输入 350ms 租约；松键、失焦、弹窗、切换视角和加载存档清除控制。
- 客户端最多保留一个在途移动请求及一个最新待发方向；过期方向归零，网络失败不重发移动，读取服务端修订后恢复。移动续租不逐条写快照/操作表，位置沿用正常保存周期。
- 原 240 秒结束逻辑、末期召回和社交截止时间裁剪已移除。保留队员死亡及篝火熄灭的实际失败条件。
- 1 倍速一日 600 秒：白天 420 秒、夜晚 180 秒，从明亮白天 06:00 开始循环。昼夜、HUD、光照和模型时钟输入共用规则；2/4 倍速随模拟加速。旧档时间按新循环重算天数，已结束历史不自动复活。
- 灾难阶段仅提供类型扩展契约，尚无新增灾难玩法。尚未实现多人房间、身份认证或网络插值/预测。

## 验证证据

`npm run build` 成功，保留现有大包体警告。

9 个相关测试文件共 47 项通过：world、endless-runtime、endless-world、camp-clock、lord、lord-runtime、lord-client、lord-persistence、third-person。

浏览器使用隔离服务 18085 / 页面 4185 / `data/lord-validation.sqlite`：

- 新局显示第 1 天 06:00，晴朗白昼；没有结算倒计时。
- S/W 真实按键可移动领主；松键后的坐标停止，暂停时坐标保持。
- Tab 可往返两种视角，上帝镜头恢复原位置。
- 浏览器已实际运行超过 4 分钟，仍继续生存；暂停截图显示已生存 4:15。
- 截图：`docs/screenshots/lord-third-person.png`、`docs/screenshots/lord-god-view.png`。

审查已覆盖输入堆积、过期控制、断线修订恢复、移动持久化增长、可编辑控件焦点、镜头独立状态及循环时钟。相关路径未发现尚未处理的实质问题。

## 全量回归边界

最终 `npm test -- --maxWorkers=1 --testTimeout=30000`：50 个文件，502 项通过、14 项失败。日志 `data/lord-full-test-verified.log`。以下失败涉及工作目录中进行中的河道/聚落位置、房屋和迁移断言，本次未修改这些断言或对应地理实现，也未将全量回归标记为通过：

1. audio — brings the creek forward when the listening character approaches its bank
2. environment — advects actual river foam downstream faster in the channel than at either bank
3. persistence — preserves an old east-bank save and reconnects camp through the actual bridge
4. persistence — moves newly submerged legacy ground onto a safe camp-connected bank
5. persistence — migrates a real v1 engine save without fabricating its historical observation values
6. physics — keeps the river hazardous as it passes the map edge at y=3
7. physics — keeps the river hazardous as it passes the map edge at y=97
8. physics — gives water its own contact injury and utterance
9. physics — updates the visible injury source when a different hazard hurts during the speech cooldown
10. valley-settlement — opens onto a designed main avenue, with houses on side lanes and deliberate planting
11. weather-policy — normalizes the MLP vector while retaining the same raw world values in detached structured context
12. weather-policy — lets weather alter observation values without turning gathering into a forbidden action
13. weather — soaks exposed people while the actual thatched house lets a resting person dry
14. world-navigation — 真实树干阻挡通行，林中可绕行而非穿树

此前全量运行还有一次 Vitest onTaskUpdate 通信超时；最终这次运行未报告该通信错误。
