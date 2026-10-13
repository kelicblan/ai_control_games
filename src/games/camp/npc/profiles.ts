import type { NpcProfile } from '../../../../packages/npc-core/src';
import type { NpcId } from '../simulation/types';

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
};
