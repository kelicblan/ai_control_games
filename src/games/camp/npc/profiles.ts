import type { NpcProfile } from '../../../../packages/npc-core/src';
import type { Npc, NpcId } from '../simulation/types';

/**
 * 营地独有的人物配置。核心只接收数字，不认识“老周”等名字。
 * 勤奋低不等于永远拒绝：自身利益、身体状态、关系和事件共同改变选择。
 * linlan 是已发布存档和模型所用的稳定键，显示名已经改为林枫。
 */
export const CAMP_PROFILES: Record<NpcId, NpcProfile> = {
  azhuang: { id: 'azhuang', traits: { diligence: .82, empathy: .6, honesty: .9, selfInterest: .3, impulsivity: .5, autonomy: .54, patience: .8, fairness: .72, courage: .9 } },
  xiaomi: { id: 'xiaomi', traits: { diligence: .78, empathy: .72, honesty: .94, selfInterest: .28, impulsivity: .18, autonomy: .35, patience: .84, fairness: .58, courage: .27 } },
  laozhou: { id: 'laozhou', traits: { diligence: .24, empathy: .26, honesty: .18, selfInterest: .94, impulsivity: .25, autonomy: .73, patience: .7, fairness: .45, courage: .56 } },
  linlan: { id: 'linlan', traits: { diligence: .12, empathy: .2, honesty: .48, selfInterest: .9, impulsivity: .96, autonomy: .92, patience: .08, fairness: .83, courage: .68 } },
  aye: { id: 'aye', traits: { diligence: .47, empathy: .49, honesty: .78, selfInterest: .54, impulsivity: .58, autonomy: .96, patience: .45, fairness: .4, courage: .77 } },
  tiesheng: { id: 'tiesheng', traits: { diligence: .96, empathy: .38, honesty: .98, selfInterest: .18, impulsivity: .12, autonomy: .62, patience: .96, fairness: .76, courage: .74 } },
  aling: { id: 'aling', traits: { diligence: .76, empathy: .98, honesty: .88, selfInterest: .12, impulsivity: .34, autonomy: .48, patience: .78, fairness: .88, courage: .52 } },
  xiaoman: { id: 'xiaoman', traits: { diligence: .32, empathy: .56, honesty: .38, selfInterest: .86, impulsivity: .36, autonomy: .68, patience: .54, fairness: .52, courage: .22 } },
  shenyan: { id: 'shenyan', traits: { diligence: .9, empathy: .32, honesty: .99, selfInterest: .24, impulsivity: .06, autonomy: .72, patience: .64, fairness: .98, courage: .46 } },
};

/** 返回本局人格，不读取设置数据库，不修改内置配置或其他角色。快照在开局/读档边界校验。 */
export function getCampProfile(npc: Pick<Npc, 'id' | 'initialSettings'>): NpcProfile {
  const base = CAMP_PROFILES[npc.id];
  if (!npc.initialSettings) return base;
  return { id: npc.id, traits: Object.fromEntries(Object.entries(base.traits)
    .map(([key, fallback]) => [key, npc.initialSettings?.values[`trait.${key}`] ?? fallback])) as unknown as NpcProfile['traits'] };
}
export function hasCustomCampTraits(npc: Pick<Npc, 'id' | 'initialSettings'>): boolean {
  return !!npc.initialSettings && Object.entries(CAMP_PROFILES[npc.id].traits)
    .some(([key, value]) => npc.initialSettings!.values[`trait.${key}`] !== value);
}
/** 给表达层的短描述也由数值生成，避免把改成诚实的老周仍然描述成低诚实。 */
export function customCampPersona(npc: Pick<Npc, 'id' | 'initialSettings'>): string {
  const t = getCampProfile(npc).traits;
  return [t.diligence >= .65 ? '愿意劳动' : t.diligence < .35 ? '不爱劳动' : '劳动意愿适中',
    t.honesty >= .65 ? '重视诚实' : t.honesty < .35 ? '会掩饰私心' : '诚实倾向适中',
    t.selfInterest >= .65 ? '重视自己利益' : '兼顾同伴利益',
    t.impulsivity >= .65 ? '容易冲动' : '比较克制', t.autonomy >= .65 ? '很重视自主' : '能接受协调',
    t.patience < .35 ? '耐心不足' : '愿意等待', t.empathy >= .65 ? '关心同伴' : '共情较弱',
    t.fairness >= .65 ? '在意分工与守约' : '不太计较分工', t.courage < .35 ? '谨慎避险' : '敢于行动'].join('，');
}
