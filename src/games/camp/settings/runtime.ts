import { SettingsError, validateSettings, validateValues, type NpcSettings } from '../../../../packages/npc-settings/src';
import { CAMP_FIELDS, CAMP_SETTINGS_CATALOG } from './catalog';
import { CAMP_PROFILES, getCampProfile, hasCustomCampTraits } from '../npc/profiles';
import { clamp, NPC_PROFILES } from '../simulation/constants';
import type { ActionId, GameState, Npc } from '../simulation/types';

/** 一局自带的初始化快照，不引用设置数据库；数值只在开局应用一次。 */
export interface CampInitialSettings { schemaVersion: 1; values: Record<string, number> }
export function isValidCampInitialSettings(input: unknown): input is CampInitialSettings {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    const record = input as Record<string, unknown>;
    if (Object.getPrototypeOf(record) !== Object.prototype || Object.keys(record).length !== 2
      || record.schemaVersion !== 1 || !Object.prototype.hasOwnProperty.call(record, 'values')) return false;
    validateValues(CAMP_FIELDS, record.values);
    return true;
  } catch { return false; }
}
/** 名字保持稳定，但不能把自定义的勤奋角色仍标记为“懒散刺头”。 */
export function configuredCampRole(npc: Pick<Npc, 'id' | 'initialSettings'>): string {
  return hasCustomCampTraits(npc) ? '自定义性格的伙伴' : NPC_PROFILES.find(profile => profile.id === npc.id)!.role;
}
/**
 * 保留未编辑的旧 MLP 投影（早期阿壮/小米共情投影与心智基值不同）。
 * 用户明确调整某一人格维度后，该维度才映射到模型；只改体力不能偷偷改变人格。
 */
export function configuredTaskPersonality(npc: Pick<Npc, 'id' | 'initialSettings'>): Npc['personality'] {
  const legacy = NPC_PROFILES.find(profile => profile.id === npc.id)!.personality;
  const base = CAMP_PROFILES[npc.id].traits;
  const traits = getCampProfile(npc).traits;
  return { bravery: traits.courage === base.courage ? legacy.bravery : traits.courage,
    diligence: traits.diligence === base.diligence ? legacy.diligence : traits.diligence,
    empathy: traits.empathy === base.empathy ? legacy.empathy : traits.empathy };
}
/**
 * 只能对尚未开始的新局调用。校验整份文档后再修改角色，保证非法输入无部分写入。
 * 全默认角色不额外创建快照，保持原有开局、测试和旧档兼容行为。
 */
export function applyCampInitialSettings(state: GameState, document: NpcSettings): void {
  if (state.status !== 'ready' || state.elapsed !== 0) throw new SettingsError('invalid', '角色初始配置只能在新开局时应用。');
  const clean = validateSettings(CAMP_SETTINGS_CATALOG, document);
  for (const npc of state.npcs) {
    const values = clean.characters[npc.id];
    const defaults = CAMP_SETTINGS_CATALOG.characters.find(person => person.id === npc.id)!.defaults;
    if (CAMP_FIELDS.every(field => values[field.id] === defaults[field.id])) continue;
    npc.initialSettings = { schemaVersion: 1, values: { ...values } };
    npc.personality = configuredTaskPersonality(npc);
    npc.role = configuredCampRole(npc);
    for (const stat of ['health', 'energy', 'hunger', 'morale', 'trust', 'fear'] as const) npc[stat] = values[`body.${stat}`];
    if (state.scenario === 'conflict') { npc.hunger = clamp(npc.hunger + 22); npc.trust = clamp(npc.trust - 24); }
    // 心智中不保存人格，只保存经历；后续评价统一从 getCampProfile 获取这局参数。
  }
}
/** 技能影响真实工作进度；送货是物理运输阶段，不按采木/采集技能加速。 */
export function campSkillMultiplier(npc: Pick<Npc, 'initialSettings' | 'inventory'>, action: ActionId): number {
  if (npc.inventory.wood || npc.inventory.food || !['wood', 'food', 'fire', 'help', 'explore'].includes(action)) return 1;
  const level = npc.initialSettings?.values[`skill.${action}`] ?? 50;
  return .5 + level / 100;
}
