import type { NumericField, SettingsCatalog } from '../../../../packages/npc-settings/src';
import { createNpc, NPC_PROFILES } from '../simulation/constants';
import { CAMP_PROFILES } from '../npc/profiles';

/** 字段名称、技能种类和默认值都属于营地。通用设置包只认识字段目录。 */
const trait = (id: string, label: string, description: string): NumericField => ({
  id: `trait.${id}`, label, description, group: '性格倾向', min: 0, max: 1, step: .01, displayScale: 100,
});
const body = (id: string, label: string, description: string, min = 0): NumericField => ({
  id: `body.${id}`, label, description, group: '身体与关系初始值', min, max: 100, step: 1,
});
export const CAMP_FIELDS: readonly NumericField[] = [
  trait('diligence', '勤奋', '越高越愿意承担劳动；这是意愿，不等于技能熟练度。'),
  trait('empathy', '共情', '越高越在意同伴的困难与集体收益。'),
  trait('honesty', '诚实', '低值更可能用借口掩饰回避动机，但不能伪造真实任务成果。'),
  trait('selfInterest', '自利', '越高越重视自己的收益和精力。'),
  trait('impulsivity', '冲动', '越高越容易在被否决后直接表达愤怒。'),
  trait('autonomy', '自主', '越高越希望自己决定，而不是持续接受命令。'),
  trait('patience', '耐心', '越高越能等待协调，情绪更容易平复。'),
  trait('fairness', '公平敏感', '越高越在意失约和自己感受到的分工失衡。'),
  trait('courage', '胆量', '影响风险取舍与公开表达异议的倾向。'),
  body('health', '初始健康', '新开局的健康值；最低为 1，不会创建已经死亡的角色。', 1),
  body('energy', '初始体力', '新开局剩余体力。不会改变体力上限或覆盖继续中的存档。'),
  body('hunger', '初始饥饿', '越高越饥饿。分歧时刻场景在此基础上增加 22，最高 100。'),
  body('morale', '初始士气', '影响开局精神状态，后续仍受实际遭遇影响。'),
  body('trust', '初始信任', '对玩家的初始信任。分歧时刻场景再降低 24，最低 0。'),
  body('fear', '初始恐惧', '越高越担忧，后续随风险与环境变化。'),
  ...[
    ['wood', '采木技能'], ['food', '采集技能'], ['fire', '守火技能'],
    ['help', '照护技能'], ['explore', '探索技能'],
  ].map(([id, label]): NumericField => ({ id: `skill.${id}`, label, group: '工作技能', min: 0, max: 100, step: 1,
    description: '50 为原有速度；0 为 0.5 倍，100 为 1.5 倍。只影响本项工作进度，不增加凭空产出，也不加速送货。' })),
];
export const CAMP_SETTINGS_CATALOG: SettingsCatalog = {
  gameId: 'campmind', schemaVersion: 1, fields: CAMP_FIELDS,
  characters: NPC_PROFILES.map(identity => {
    const npc = createNpc(identity.id);
    const traits = CAMP_PROFILES[identity.id].traits;
    return { id: identity.id, label: identity.name, description: `默认设定：${identity.role}。修改后以本局保存的数值为准。`,
      defaults: Object.fromEntries(CAMP_FIELDS.map(field => {
        const [group, key] = field.id.split('.');
        const value = group === 'trait' ? traits[key as keyof typeof traits]
          : group === 'body' ? npc[key as 'health' | 'energy' | 'hunger' | 'morale' | 'trust' | 'fear'] : 50;
        return [field.id, value];
      })) };
  }),
};
