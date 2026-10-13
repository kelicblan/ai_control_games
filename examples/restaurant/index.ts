/**
 * 第二个游戏的最小适配：餐厅只有备餐、上菜和休息。
 * 这个文件没有营地导入。心智选择行为，餐厅自己核验订单并修改产出，证明两者分离。
 */
import { createMind, decideBehavior, receiveEvent } from '../../packages/npc-core/src';
import type { ActionOffer, MindState, NpcProfile } from '../../packages/npc-core/src';

export interface RestaurantEmployee {
  profile: NpcProfile;
  mind: MindState;
  fatigue: number;
  workload: number;
  trust: number;
  progress: number;
}
export interface RestaurantState {
  now: number;
  prepared: number;
  served: number;
  eventSequence: number;
  staff: RestaurantEmployee[];
}

export function createRestaurant(seed = 1): RestaurantState {
  const profiles: NpcProfile[] = [
    { id: 'careful_cook', traits: { diligence: .9, empathy: .8, honesty: .9, selfInterest: .2, impulsivity: .15, autonomy: .3, patience: .9, fairness: .6, courage: .6 } },
    { id: 'opportunistic_waiter', traits: { diligence: .2, empathy: .25, honesty: .15, selfInterest: .9, impulsivity: .2, autonomy: .65, patience: .75, fairness: .6, courage: .4 } },
  ];
  return { now: 0, prepared: 0, served: 0, eventSequence: 0, staff: profiles.map(profile => ({ profile, mind: createMind(profile, 0, seed), fatigue: .15, workload: 0, trust: .7, progress: 0 })) };
}

/** 宿主拥有世界修改权；语言和意图从不直接写入 prepared / served。 */
export function restaurantTick(state: RestaurantState): void {
  state.now += 2;
  for (const person of state.staff) {
    const offers: ActionOffer[] = [
      { id: 'prepare_dish', kind: 'work', effort: .65, risk: .1, selfBenefit: .15, groupBenefit: .85, baseline: state.prepared < 3 ? 1 : .3 },
      { id: 'sit_in_breakroom', kind: 'rest', effort: 0, risk: 0, selfBenefit: .75, groupBenefit: 0, baseline: .1 },
    ];
    if (state.prepared > 0) offers.push({ id: 'serve_guest', kind: 'work', effort: .5, risk: 0, selfBenefit: .2, groupBenefit: .8, baseline: state.prepared >= 3 ? 1 : .5 });
    const decision = decideBehavior(person.mind, person.profile, {
      now: state.now, needs: { fatigue: person.fatigue, hunger: .15, pain: 0, exposure: 0 },
      workload: person.workload, unfairness: 0, trustInAuthority: person.trust,
      commandActionId: state.prepared >= 3 ? 'serve_guest' : 'prepare_dish', peers: [],
    }, offers);
    if (decision.actionId === 'sit_in_breakroom') {
      person.fatigue = Math.max(0, person.fatigue - .14);
      person.workload = Math.max(0, person.workload - .2);
      continue;
    }
    // 世界条件可能在另一位员工执行后变化，真正上菜前再次核验，避免负库存。
    if (decision.actionId !== 'prepare_dish' && (decision.actionId !== 'serve_guest' || state.prepared <= 0)) continue;
    person.progress += .6 * decision.effort;
    person.fatigue = Math.min(1, person.fatigue + .035 * decision.effort);
    person.workload = Math.min(1, person.workload + .045 * decision.effort);
    if (person.progress >= 1) {
      person.progress -= 1;
      if (decision.actionId === 'prepare_dish') state.prepared++;
      else { state.prepared--; state.served++; }
      const delta = receiveEvent(person.mind, person.profile, { sequence: ++state.eventSequence, at: state.now, type: 'work_completed', fact: decision.actionId === 'prepare_dish' ? '完成一道备餐' : '客人收到一道餐品' });
      person.trust = Math.max(0, Math.min(1, person.trust + delta.trustDelta));
    }
  }
}
