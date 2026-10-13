import { describe, expect, it } from 'vitest';
import { createMind, decideBehavior, isValidMindState, receiveEvent, updateMind } from '../packages/npc-core/src';
import type { ActionOffer, MindObservation, NpcProfile } from '../packages/npc-core/src';
import { createRestaurant, restaurantTick } from '../examples/restaurant';

const patient: NpcProfile = { id: 'patient', traits: { diligence: .9, empathy: .8, honesty: .9, selfInterest: .2, impulsivity: .12, autonomy: .3, patience: .95, fairness: .7, courage: .6 } };
const volatile: NpcProfile = { id: 'volatile', traits: { diligence: .12, empathy: .2, honesty: .6, selfInterest: .95, impulsivity: .96, autonomy: .95, patience: .05, fairness: .8, courage: .9 } };
const calculating: NpcProfile = { ...volatile, id: 'calculating', traits: { ...volatile.traits, honesty: .1, impulsivity: .15, patience: .75, courage: .3 } };
const offers: ActionOffer[] = [
  { id: 'prepare_dishes', kind: 'work', effort: .8, risk: .1, selfBenefit: .1, groupBenefit: .9, baseline: 1 },
  { id: 'take_a_break', kind: 'rest', effort: 0, risk: 0, selfBenefit: .8, groupBenefit: 0, baseline: .1 },
];
const observe = (changes: Partial<MindObservation> = {}): MindObservation => ({ now: 0, needs: { fatigue: .8, hunger: .2, pain: 0, exposure: 0 }, workload: .7, unfairness: .4, trustInAuthority: .7, commandActionId: 'prepare_dishes', peers: [], ...changes });

function deny(profile: NpcProfile, count: number) {
  const mind = createMind(profile, 0, 27);
  updateMind(mind, profile, observe());
  for (let sequence = 1; sequence <= count; sequence++) receiveEvent(mind, profile, { sequence, at: sequence, type: 'request_denied', concern: 'rest', fact: '休息请求被拒绝' });
  return mind;
}

describe('跨游戏 NPC 心智', () => {
  it('没有真实冲突时，暂停期间连续三十次道歉不会增加信任', () => {
    const mind = createMind(patient);
    for (let sequence = 1; sequence <= 30; sequence++) {
      const delta = receiveEvent(mind, patient, { sequence, at: 0, type: 'apologized', fact: '再次道歉' });
      expect(delta).toEqual({ applied: true, trustDelta: 0, moraleDelta: 0 });
    }
    expect(mind.emotions).toEqual({ anger: 0, resentment: 0, stress: 0 });
  });

  it('同一冲突阶段只接受一次有效道歉，不能用新事件序号继续缓和或刷信任', () => {
    const mind = deny(volatile, 2);
    const before = { ...mind.emotions };
    const first = receiveEvent(mind, volatile, { sequence: 3, at: 2, type: 'apologized', fact: '承认刚才拒绝得太强硬' });
    expect(first.trustDelta).toBeGreaterThan(0);
    expect(mind.emotions.anger).toBeLessThan(before.anger);
    expect(mind.emotions.resentment).toBe(before.resentment);
    expect(mind.concerns[0].denials).toBe(2);
    const after = { ...mind.emotions };
    for (let sequence = 4; sequence <= 30; sequence++) {
      expect(receiveEvent(mind, volatile, { sequence, at: 2, type: 'apologized', fact: '换一句话再道歉' }))
        .toEqual({ applied: true, trustDelta: 0, moraleDelta: 0 });
      expect(mind.emotions).toEqual(after);
    }
  });

  it('道歉阶段独立于裁剪后的记忆，JSON恢复后仍不能重复获得信任', () => {
    const mind = deny(volatile, 1);
    receiveEvent(mind, volatile, { sequence: 2, at: 1, type: 'apologized', fact: '为拒绝道歉' });
    for (let sequence = 3; sequence <= 50; sequence++) {
      receiveEvent(mind, volatile, { sequence, at: 1, type: 'work_completed', fact: '完成普通工作' });
    }
    expect(mind.memories.some(memory => memory.type === 'apologized' || memory.type === 'request_denied')).toBe(false);
    const restored = JSON.parse(JSON.stringify(mind));
    expect(isValidMindState(restored)).toBe(true);
    const before = { ...restored.emotions };
    expect(receiveEvent(restored, volatile, { sequence: 51, at: 1, type: 'apologized', fact: '读档后再道歉' }).trustDelta).toBe(0);
    expect(restored.emotions).toEqual(before);
  });

  it.each(['request_denied', 'promise_broken', 'urged', 'deception_exposed'] as const)('新的%s事件开启新的冲突阶段，只能再获得一次道歉收益', type => {
    const mind = deny(volatile, 1);
    receiveEvent(mind, volatile, { sequence: 2, at: 1, type: 'apologized', fact: '先为上一轮道歉' });
    receiveEvent(mind, volatile, { sequence: 3, at: 1, type, concern: 'rest', fact: '新的真实冲突' });
    expect(receiveEvent(mind, volatile, { sequence: 4, at: 1, type: 'apologized', fact: '为新冲突道歉' }).trustDelta).toBeGreaterThan(0);
    expect(receiveEvent(mind, volatile, { sequence: 5, at: 1, type: 'apologized', fact: '重复道歉' }).trustDelta).toBe(0);
  });

  it('没有和解字段的旧心智保持可读，不从残余记忆猜测新的道歉奖励', () => {
    const mind = deny(volatile, 1);
    Reflect.deleteProperty(mind, 'reconciliation');
    expect(isValidMindState(mind)).toBe(true);
    expect(receiveEvent(mind, volatile, { sequence: 2, at: 1, type: 'apologized', fact: '旧档恢复后道歉' }).trustDelta).toBe(0);
    receiveEvent(mind, volatile, { sequence: 3, at: 1, type: 'urged', fact: '读档后新的催促' });
    expect(receiveEvent(mind, volatile, { sequence: 4, at: 1, type: 'apologized', fact: '为新催促道歉' }).trustDelta).toBeGreaterThan(0);
  });

  it('和解阶段若存在则严格校验范围、单调关系和未知字段', () => {
    const mind = deny(volatile, 2);
    const valid = { ...mind, reconciliation: { grievanceRevision: 2, apologyRevision: 1 } };
    expect(isValidMindState(valid)).toBe(true);
    for (const reconciliation of [null, {},
      { grievanceRevision: -1, apologyRevision: 0 },
      { grievanceRevision: 1.5, apologyRevision: 0 },
      { grievanceRevision: Infinity, apologyRevision: 0 },
      { grievanceRevision: 3, apologyRevision: 0 },
      { grievanceRevision: 1, apologyRevision: 2 },
      { grievanceRevision: 2, apologyRevision: 1, extra: 1 },
    ]) expect(isValidMindState({ ...mind, reconciliation })).toBe(false);
  });

  it('拒绝只记入一次，记忆裁剪也不使旧事件重新生效', () => {
    const mind = createMind(patient);
    const event = { sequence: 1, at: 1, type: 'request_denied' as const, concern: 'rest' as const, fact: '拒绝休息' };
    expect(receiveEvent(mind, patient, event).trustDelta).toBeLessThan(0);
    expect(receiveEvent(mind, patient, event)).toEqual({ applied: false, trustDelta: 0, moraleDelta: 0 });
    for (let sequence = 2; sequence <= 100; sequence++) receiveEvent(mind, patient, { sequence, at: sequence, type: 'work_completed', fact: '完成一份准备' });
    expect(mind.memories.length).toBeLessThanOrEqual(32);
    const saved = JSON.stringify(mind);
    expect(receiveEvent(mind, patient, event).applied).toBe(false);
    expect(JSON.stringify(mind)).toBe(saved);
    expect(mind.concerns.find(item => item.kind === 'rest')?.denials).toBe(1);
  });

  it('同样的连续拒绝使耐心人物忍耐，冲动人物真实离开工作', () => {
    const steady = deny(patient, 3);
    const angry = deny(volatile, 3);
    const context = observe({ now: 4 });
    expect(decideBehavior(steady, patient, context, offers).intent).toBe('endure');
    const response = decideBehavior(angry, volatile, context, offers);
    expect(['refuse', 'rest', 'recruit', 'strike']).toContain(response.intent);
    expect(response.actionId).toBe('take_a_break');
    expect(response.expression.tone).toBe('angry');
    expect(response.expression.kind).not.toBe('request');
  });

  it('同一诉求保留拒绝次数，获准也必须等实际恢复才关闭', () => {
    const mind = deny(patient, 2);
    const initialId = mind.concerns.find(item => item.kind === 'rest')!.id;
    updateMind(mind, patient, observe({ now: 30 }));
    expect(mind.concerns.find(item => item.id === initialId)?.denials).toBe(2);
    receiveEvent(mind, patient, { sequence: 3, at: 31, type: 'request_granted', concern: 'rest', fact: '同意休息' });
    expect(mind.concerns.find(item => item.id === initialId)?.status).toBe('granted');
    updateMind(mind, patient, observe({ now: 32, needs: { fatigue: .25, hunger: .2, pain: 0, exposure: 0 }, workload: .1 }));
    expect(mind.concerns.find(item => item.id === initialId)?.status).toBe('resolved');
    updateMind(mind, patient, observe({ now: 60 }));
    expect(mind.concerns.find(item => item.kind === 'rest' && item.status === 'open')?.id).toBeGreaterThan(initialId);
  });

  it('拒工拥有最短维持时间，重新下命令不会逐帧恢复服从', () => {
    const mind = deny(volatile, 3);
    const first = decideBehavior(mind, volatile, observe({ now: 4 }), offers);
    const second = decideBehavior(mind, volatile, observe({ now: 5, trustInAuthority: 1, unfairness: 0 }), offers);
    expect(second.intent).toBe(first.intent);
    expect(second.actionId).toBe(first.actionId);
    expect(mind.intent.until).toBeGreaterThan(5);
  });

  it('新的明确否决可以打断原本合作，普通重下命令则不能清掉已经形成的拒工', () => {
    const mind = createMind(volatile);
    const initialOffers = offers.map(offer => ({ ...offer, selfBenefit: offer.kind === 'work' ? 1 : 0 }));
    decideBehavior(mind, volatile, observe({ needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 }, workload: 0, unfairness: 0 }), initialOffers);
    receiveEvent(mind, volatile, { sequence: 1, at: 1, type: 'request_denied', concern: 'rest', fact: '明确拒绝休息' });
    const after = decideBehavior(mind, volatile, observe({ now: 1 }), initialOffers);
    expect(after.intent).toBe('refuse');
  });

  it('低勤奋自利人物有体力也偷懒，低诚实人物允许掩饰但不篡改世界', () => {
    const mind = createMind(calculating, 0, 6);
    const context = observe({ needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 }, workload: .1, unfairness: 0 });
    const before = JSON.stringify(context);
    const response = decideBehavior(mind, calculating, context, offers);
    expect(response.intent).toBe('evade');
    expect(response.effort).toBeLessThan(.5);
    expect(response.expression.allowDeception).toBe(true);
    expect(response.expression.kind).toBe('conceal');
    expect(JSON.stringify(context)).toBe(before);
  });

  it('具体的个人收益会改变自利人物选择，懒惰不是永久拒绝任何工作', () => {
    const mind = createMind(calculating);
    const context = observe({ needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 }, workload: 0, unfairness: 0 });
    const beneficial = offers.map(offer => ({ ...offer, selfBenefit: offer.kind === 'work' ? 1 : 0 }));
    const decision = decideBehavior(mind, calculating, context, beneficial);
    expect(decision.actionId).toBe('prepare_dishes');
    expect(decision.intent).toBe('cooperate');
    expect(decision.effort).toBeGreaterThan(.5);
  });

  it.each(['aid', 'explore'] as const)('未选中的低收益工作不应让明确的高收益%s请求被统一判成逃避', kind => {
    const mind = createMind(calculating);
    const actionId = `beneficial_${kind}`;
    const context = observe({ needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 },
      workload: 0, unfairness: 0, commandActionId: actionId });
    const candidates: ActionOffer[] = [
      ...offers.map(offer => ({ ...offer, baseline: .1 })),
      { id: actionId, kind, effort: .6, risk: .05, selfBenefit: 1, groupBenefit: .9, baseline: 1 },
    ];
    const decision = decideBehavior(mind, calculating, context, candidates);
    expect(decision.actionId).toBe(actionId);
    expect(decision.intent).toBe('cooperate');
  });

  it('没有命令时，只评估基础策略选中的候选是否值得逃避', () => {
    const mind = createMind(calculating);
    const context = observe({ needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 },
      workload: 0, unfairness: 0, commandActionId: undefined });
    const candidates: ActionOffer[] = [...offers.map(offer => ({ ...offer, baseline: .1 })),
      { id: 'beneficial_aid', kind: 'aid', effort: .6, risk: .05, selfBenefit: 1, groupBenefit: .9, baseline: 1 }];
    const decision = decideBehavior(mind, calculating, context, candidates);
    expect(decision.actionId).toBe('beneficial_aid');
    expect(decision.intent).toBe('cooperate');
  });

  it('已经明显饥饿的懒惰人物会吃饭，不会被偷懒分支锁住直到濒危', () => {
    const mind = createMind(calculating);
    const context = observe({ needs: { fatigue: .1, hunger: .82, pain: 0, exposure: 0 }, workload: 0, unfairness: 0 });
    const withMeal: ActionOffer[] = [...offers, { id: 'eat_staff_meal', kind: 'eat', effort: 0, risk: 0, selfBenefit: 1, groupBenefit: 0 }];
    const decision = decideBehavior(mind, calculating, context, withMeal);
    expect(decision.actionId).toBe('eat_staff_meal');
    expect(decision.expression.concern).toBe('food');
  });

  it('停工响应考虑自己的动机，不会让被告知抗议的所有人物同时反抗', () => {
    const dissatisfied = deny(volatile, 3);
    const loyal = createMind(patient);
    const peers = [{ id: 'colleague', affinity: .9, anger: .9, resentment: .9, protesting: true, observedAt: 4 }];
    const protest = decideBehavior(dissatisfied, volatile, observe({ now: 4, peers }), offers);
    expect(protest.intent).toBe('strike');
    const cooperate = decideBehavior(loyal, patient, observe({ now: 4, peers, needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 }, workload: .1, unfairness: 0, trustInAuthority: .95 }), offers);
    expect(cooperate.intent).toBe('cooperate');
    expect(cooperate.actionId).toBe('prepare_dishes');
  });

  it('疲劳危急会打断原工作意图，恢复后允许结束休息', () => {
    const mind = createMind(patient);
    decideBehavior(mind, patient, observe({ needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 }, workload: .1 }), offers);
    const urgent = decideBehavior(mind, patient, observe({ now: 1, needs: { fatigue: .97, hunger: .1, pain: 0, exposure: 0 } }), offers);
    expect(urgent.actionId).toBe('take_a_break');
    const recovered = decideBehavior(mind, patient, observe({ now: 2, needs: { fatigue: .2, hunger: .1, pain: 0, exposure: 0 }, workload: .1, unfairness: 0 }), offers);
    expect(recovered.actionId).toBe('prepare_dishes');
  });

  it('没有合法候选时不产生宿主未提供的动作', () => {
    const response = decideBehavior(createMind(patient), patient, observe(), []);
    expect(response.actionId).toBeNull();
  });

  it('没有诉求或冲突时，基础策略可以保留自己的合法任务偏好', () => {
    const mind = createMind(patient);
    const context = observe({ needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 }, workload: .1, unfairness: 0 });
    const restPreferred = offers.map(offer => ({ ...offer, baseline: offer.kind === 'rest' ? 1 : 0 }));
    expect(decideBehavior(mind, patient, context, restPreferred).actionId).toBe('take_a_break');
  });

  it('独立餐厅适配与 JSON 保存恢复产生相同后续结果', () => {
    const original = createRestaurant(42);
    for (let index = 0; index < 5; index++) restaurantTick(original);
    expect(original.staff.every(person => isValidMindState(person.mind))).toBe(true);
    const restored = JSON.parse(JSON.stringify(original));
    for (let index = 0; index < 12; index++) { restaurantTick(original); restaurantTick(restored); }
    expect(restored).toEqual(original);
    expect(original.prepared + original.served).toBeGreaterThan(0);
    expect(original.staff.some(person => person.mind.intent.kind === 'evade')).toBe(true);
  });

  it('严格拒绝损坏的心智、无限数值、未知版本和超限记录', () => {
    const mind = deny(volatile, 2);
    expect(isValidMindState(JSON.parse(JSON.stringify(mind)))).toBe(true);
    expect(isValidMindState({ ...mind, version: 2 })).toBe(false);
    expect(isValidMindState({ ...mind, emotions: { ...mind.emotions, anger: Infinity } })).toBe(false);
    expect(isValidMindState({ ...mind, lastEventSequence: -1 })).toBe(false);
    expect(isValidMindState({ ...mind, inventedWorldResources: 50 })).toBe(false);
    expect(isValidMindState({ ...mind, memories: Array.from({ length: 100 }, () => mind.memories[0]) })).toBe(false);
  });

  it('心智边界拒绝抛异常的宿主对象，不让校验异常中断加载流程', () => {
    const throwing = new Proxy(createMind(patient), { get() { throw new Error('host getter failed'); } });
    expect(isValidMindState(throwing)).toBe(false);
  });
});
