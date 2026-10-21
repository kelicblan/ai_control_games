import { appendEvent } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { selectWorldRules } from '../config/load';
import { supplement } from './resources';
const goals = [
  { id: 'food', title: '先保住两日口粮', instruction: '采集野果或狩猎，把携带的食物搬运入库。', page: '营地', benefit: '减少饥饿风险，腾出人手建设。' },
  { id: 'workshop', title: '建造营地工坊', instruction: '投入木材12、石料4、绳索2，建成真实制作工位。', page: '营地', benefit: '开放工坊制造，人员会前往工位工作。' },
  { id: 'bow', title: '让一人真正装备弓', instruction: '制作简易弓或强化长弓，指定接收人并确认已装备。', page: '制作', benefit: '获得远程攻击距离，可参与狩猎与防卫。' },
  { id: 'hunt', title: '完成一次狩猎收获', instruction: '选择可承受的猎物；击败后靠近获取肉，伙伴也会收集猎物。', page: '狩猎', benefit: '把装备转化为实际食物来源。' },
  { id: 'return', title: '把猎获搬运入库', instruction: '猎手带肉回营地；伙伴的掉落物需拾取后搬运。', page: '营地', benefit: '公共口粮实际增加，全营地能使用这次收获。' },
  { id: 'growth', title: '积累贡献并升到二级', instruction: '采集、搬运、制作、建设、探索和救援都会积累经验。', page: '人物', benefit: '生命、防御与生产能力成长，在人物页查看具体增量。' },
] as const;
export function foodSecurity(state: VillageState) {
  const rules = selectWorldRules('village-v1', state.ruleVersion);
  const config = supplement<{ foodPerRecruitPerDay?: number; foodPerPlayerPerDay?: number; meatFoodRatio?: number }>(rules, 'D12');
  const free = (key: string) => Math.max(0, (state.inventory[key] ?? 0) - Object.values(state.reservations).reduce((n, r) => n + (r[key] ?? 0), 0));
  const living = Object.values(state.actors).filter(a => !a.body.incapacitated);
  const daily = living.reduce((n, a) => n + (a.kind === 'player' ? config.foodPerPlayerPerDay ?? 0 : config.foodPerRecruitPerDay ?? 0), 0);
  const available = free('food') + Math.floor(free('meat') * (config.meatFoodRatio ?? 1));
  return { available, daily, days: daily > 0 ? Math.floor(available / daily * 10) / 10 : 0, daySeconds: rules.clock.daylightSeconds + rules.clock.nightSeconds, population: living.length };
}
/** Persist accomplishments from evidence once; current shortages do not erase past achievement. */
export function updateMilestones(state: VillageState) {
  if (!state.economy) return;
  const ledger = state.economy.journey ??= { version: 1, lastEvent: 0, completed: {}, hunts: {} };
  const record = (id: string, sourceEventId: string | null = null, extra: Record<string, string> = {}) => {
    if (ledger.completed[id]) return;
    const event = appendEvent(state, 'milestone.completed', [state.playerId], { goalId: id, sourceEventId, ...extra });
    ledger.completed[id] = { eventId: event.id, at: event.at };
  };
  if (foodSecurity(state).days >= 2) record('food');
  if (state.economy.workshop?.completedEventId) record('workshop', state.economy.workshop.completedEventId);
  if (Object.values(state.actors).some(a => a.equipment && ['WPN003', 'WPN005'].includes(state.economy!.items[a.equipment]?.recipeId))) record('bow');
  if (Object.values(state.actors).some(a => a.level >= 2)) record('growth');
  for (const event of [...state.events]) {
    if (Number(event.id.split(':ev').at(-1)) <= ledger.lastEvent) continue;
    if (['wildlife.hunt_completed', 'wildlife.harvested'].includes(event.kind) && Number(event.facts.amount) > 0) {
      if (event.kind === 'wildlife.hunt_completed') ledger.hunts[event.participants[0]] = event.id;
      record('hunt', event.id);
    }
    if (event.kind === 'resources.picked_up') {
      const container = state.economy.containers[String(event.facts.containerId)];
      if (container && Number((event.facts.quantities as Record<string, number> | undefined)?.meat) > 0 && state.events.some(e => e.id === container.sourceEventId && e.kind === 'wildlife.harvested')) ledger.hunts[event.participants[0]] = event.id;
    }
    if (event.kind === 'resources.deposited' && Number((event.facts.quantities as Record<string, number> | undefined)?.meat) > 0 && ledger.hunts[event.participants[0]]) { record('return', event.id, { huntEventId: ledger.hunts[event.participants[0]] }); delete ledger.hunts[event.participants[0]]; }
  }
  ledger.lastEvent = state.nextEvent - 1;
}
export function journeyView(state: VillageState) {
  const completed = state.economy?.journey?.completed ?? {}, current = goals.find(g => !completed[g.id]) ?? null;
  const food = foodSecurity(state), count = Object.keys(completed).length;
  return { version: 1, current, completed: goals.filter(g => completed[g.id]).map(g => ({ ...g, ...completed[g.id] })), progress: count, total: goals.length, food,
    risk: food.days < 1 ? '公共口粮不足一日，优先采食并搬运入库。' : '保障天数按每日基础维护估算，主动进食还会额外消耗。',
    choices: current ? [] : [ { title: '扩大营地', page: '营地', instruction: '先积累更多口粮，再招募伙伴；新增人口也会增加每日消耗。' }, { title: '加强防卫', page: '营地', instruction: '把材料投入围栏与伙伴装备，代价是延后扩张。' } ] };
}
