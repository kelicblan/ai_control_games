import type { ActionId, GameState, Npc } from '../simulation/types';
import { NPC_IDS } from '../simulation/types';
import { CAMP_HOUSES } from '../world/definition';
import { VILLAGE_FACILITIES } from '../world/villageLayout';
import { insideSettlement } from '../world/settlement';
import { foodReserve } from '../simulation/survival';
import { getCampClock, CAMP_PERIOD_LABELS } from '../simulation/clock';

export const VILLAGE_CONTEXT_VERSION = 1;
export const VILLAGE_LANGUAGE_RULES = '你生活在村寨，有民居和仓库，没有帐篷。篝火仅是景物，练武锻造尚未开放。';
export const obsoleteVillageText = (text: string) => /帐篷|露营|拉紧.{0,4}绳|添柴|火光可不能灭|风雨会耗掉火力/.test(text);
const covered = (npc: Npc, building: { center: { x: number; y: number }; half: { x: number; y: number } }) =>
  Math.abs(npc.position.x - building.center.x) < building.half.x && Math.abs(npc.position.y - building.center.y) < building.half.y;

export function villagePlace(_state: GameState, npc: Npc): string {
  const home = CAMP_HOUSES[NPC_IDS.indexOf(npc.id) + 1];
  if (home && covered(npc, home)) return '自己的民居';
  const facility = VILLAGE_FACILITIES.find(f => covered(npc, f));
  if (facility) return facility.name;
  if (CAMP_HOUSES.some(house => covered(npc, house))) return '村寨屋内';
  return insideSettlement(npc.position.x, npc.position.y) ? '村寨内' : '寨外荒野';
}

export function villageFacts(state: GameState, npc: Npc): string[] {
  const reserve = foodReserve(state);
  return [state.world?.gateOpen === false ? '寨门关闭，不能出入' : '寨门开放，可经桥出寨',
    state.food < reserve.minimum ? '仓库口粮低于生存线，优先补粮' : '仓库口粮储备充足',
    ...(npc.wildTask ? [`${npc.wildTask.phase === 'return' ? '携物返仓入库' : npc.wildTask.phase === 'work' ? '到达目标劳作' : '正在前往目标'}：${npc.wildTask.label}`] : []),
    `身在${villagePlace(state, npc)}`, `现在是${CAMP_PERIOD_LABELS[getCampClock(state.elapsed).period]}`];
}

/** A physical safety override changes public execution, not the character's underlying resentment. */
export function survivalExecution(state: GameState, npc: Npc): boolean {
  if (npc.action && (npc.inventory.wood || npc.inventory.food)) return true;
  if (npc.action === 'food' && npc.wildTask?.kind === 'gather' && npc.actionEffort === 1 && npc.mind?.intent.actionId !== 'food') return true;
  const decision = [...state.decisions].reverse().find(d => d.npcId === npc.id);
  return decision?.action === npc.action && /生存库存|全员补足|先完成手中物资/.test(decision?.reason ?? '');
}

export function truthfulVillageSpeech(state: GameState, npc: Npc, text: string): string {
  if (obsoleteVillageText(text)) return villageActionSpeech(state, npc, npc.action ?? 'camp');
  if (survivalExecution(state, npc) && /停工|(?:不|不会|不再).{0,5}(?:干|做|接|接受)|先停|先.{0,4}(?:休息|歇)|我就歇/.test(text))
    return villageActionSpeech(state, npc, npc.action ?? 'camp', true);
  return text;
}

export function villageActionSpeech(state: GameState, npc: Npc, action: ActionId, survival = false): string {
  if (npc.inventory.wood || npc.inventory.food) return '把这趟物资送到仓库，入库以后再歇。';
  if (survival && action === 'food') return npc.id === 'linlan' ? '先把口粮找够，分工的事回来再谈。'
    : npc.id === 'laozhou' ? '口粮不够了，先找吃的，别的回来再算。' : '先补足村里的口粮，别让大家挨饿。';
  if (survival && action === 'eat') return '先去仓库领饭，再来补足大家的口粮。';
  const wet = state.weather === 'rain' || state.weather === 'storm';
  switch (action) {
    case 'food': return `我去寨外采集${npc.wildTask?.label ?? '食物'}，收好就送回仓库。`;
    case 'wood': return '我去寨外采些木材，回来交到仓库。';
    case 'eat': return '去仓库领一份饭，吃好才有力气。';
    case 'rest': return wet ? '我回自己的民居避雨，歇脚晾干衣服。' : '我回自己的民居歇一会儿，恢复体力。';
    case 'help': return '我去伤者身边照应，看看哪里需要帮忙。';
    case 'camp': return insideSettlement(npc.position.x, npc.position.y) ? '我去村寨广场集合，照应大家。'
      : state.world?.gateOpen === false ? '寨门关着，我先等开门再回寨。' : '先返回村寨，到广场集合。';
    case 'explore': return npc.wildTask?.kind === 'hunt' ? `我去追踪${npc.wildTask.label}，猎到后送回仓库。` : '我去寨外看看资源，沿桥走，留意野兽。';
    case 'fire': return '篝火只是村里的景物，先处理眼前需要。';
  }
}
