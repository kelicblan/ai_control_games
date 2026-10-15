import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { getSocialChoices, updateSocial } from '../src/games/camp/simulation/social';
import { ACTIONS, type ActionId, type GameState, type PolicyFunction } from '../src/games/camp/simulation/types';
import { decideCampBehavior, observeCampMind, recordMindEvent } from '../src/games/camp/npc/bridge';
import { parsePlayerIntent } from '../src/games/camp/npc/player-intents';
import { getTaskDestination } from '../src/games/camp/simulation/terrain';
import { getAllowedActions } from '../src/games/camp/simulation/observation';

const woodPolicy: PolicyFunction = observation => ({ action: observation.allowed.includes('wood') ? 'wood' : 'camp', emotion: 'happy', source: 'model', latencyMs: 0,
  scores: ACTIONS.map(action => Number(action === 'wood')) });
const paused = (): GameState => ({ ...createGame({ seed: 52 }), food: 90, status: 'paused' });

describe('营地以通用心智执行人物行为', () => {
  it('新人物有真实的不合作动机，内部林岚标识保持兼容', () => {
    const state = paused();
    expect(state.npcs[3]).toMatchObject({ id: 'linlan', name: '林枫' });
    expect(state.npcs[2].personality.diligence).toBeLessThan(.4);
    expect(state.npcs[3].personality.diligence).toBeLessThan(.3);
    expect(state.npcs.every(npc => npc.mind?.npcId === npc.id)).toBe(true);
  });

  it('明确拒绝留在同一诉求，林枫实际停下，重新下令或拖动不能清掉抗拒', () => {
    let state = paused(); state.npcs[3].energy = 32;
    state = issueCommand(state, { type: 'social-open', npcId: 'linlan', topic: 'checkin' });
    const thread = state.social.threads.at(-1)!;
    expect(getSocialChoices(state, thread).some(choice => choice.id === 'deny')).toBe(true);
    const responses: string[] = [];
    for (let count = 0; count < 3; count++) {
      state = issueCommand(state, { type: 'social-chat', threadId: thread.id, text: '不准休息，继续干活' });
      responses.push(state.npcs[3].speech);
    }
    expect(new Set(responses).size).toBe(3);
    expect(responses[2]).toContain('爱谁干谁干');
    const denied = state.npcs[3].mind!.concerns.find(concern => concern.kind === 'rest' && concern.status !== 'resolved')!;
    expect(denied.denials).toBe(3);
    const anger = state.npcs[3].mind!.emotions.anger;
    state = issueCommand(state, { type: 'assign', npcId: 'linlan', action: 'wood' });
    state = advanceGame({ ...state, status: 'playing' }, .25, woodPolicy);
    expect(state.npcs[3].action).toBe('rest');
    expect(state.npcs[3].mind!.emotions.anger).toBeGreaterThan(anger * .9);
    expect(state.decisions.filter(item => item.npcId === 'linlan').at(-1)).toMatchObject({ source: 'rules', accepted: false });
    const moved = issueCommand(state, { type: 'move', npcId: 'linlan', target: { x: 20, y: 38 } });
    expect(moved.npcs[3].manualTarget).toBeUndefined();
    expect(moved.npcs[3].mind!.concerns.find(concern => concern.id === denied.id)?.denials).toBeGreaterThanOrEqual(3);
  });

  it('老周掩饰和林枫偷懒不会只改变台词，也不会伪造物资产出', () => {
    let state = paused(); const beforeWood = state.wood;
    state = issueCommand(state, { type: 'assign', npcId: 'laozhou', action: 'wood' });
    // 保留一个真实可用的采木岗位；不能靠别的未选任务触发“全局逃避”。
    state = advanceGame({ ...state, status: 'playing' }, .25, observation => ({ ...woodPolicy(observation), action: observation.npcId === 'laozhou' ? 'wood' : 'camp' }));
    const zhou = state.npcs[2];
    expect(zhou.action === 'rest' || (zhou.actionEffort ?? 1) < .8).toBe(true);
    expect(zhou.mind!.expression.allowDeception).toBe(true);
    expect(state.wood).toBe(beforeWood);
    expect(state.stats.gatheredWood).toBe(0);
  });

  it('照常返送已有物资，不允许拒工或移动让背包凭空消失', () => {
    let state = paused(); state.npcs[3].inventory.wood = 3; state.npcs[3].energy = 30;
    recordMindEvent(state, state.npcs[3], 'request_denied', '不准休息', 'rest');
    recordMindEvent(state, state.npcs[3], 'request_denied', '再次不准休息', 'rest');
    state = issueCommand(state, { type: 'move', npcId: 'linlan', target: { x: 20, y: 38 } });
    expect(state.npcs[3].manualTarget).toBeUndefined();
    state = advanceGame({ ...state, status: 'playing' }, .25, woodPolicy);
    expect(state.npcs[3].inventory.wood).toBe(3);
    expect(['rest', 'camp']).toContain(state.npcs[3].action);
  });

  it('只把附近或同一交流中的抗议提供给同伴，远处人不会全知', () => {
    const state = paused(); const speaker = state.npcs[3];
    speaker.mind!.intent.kind = 'recruit'; speaker.position = { x: 95, y: 5 };
    state.npcs[0].position = { x: 5, y: 95 };
    expect(observeCampMind(state, state.npcs[0]).peers.some(peer => peer.id === speaker.id)).toBe(false);
    state.npcs[0].position = { x: 94, y: 6 };
    expect(observeCampMind(state, state.npcs[0]).peers.some(peer => peer.id === speaker.id && peer.protesting)).toBe(true);
  });

  it('有共同积怨的知情者会实际一起停工，未受同样对待的人不会自动加入', () => {
    let state = paused();
    for (const npc of [state.npcs[2], state.npcs[3]]) {
      npc.energy = 35; npc.position = { x: 55 + (npc.id === 'linlan' ? 3 : 0), y: 68 };
      for (let i = 0; i < 5; i++) recordMindEvent(state, npc, 'request_denied', `第${i + 1}次拒绝休息`, 'rest');
    }
    state = advanceGame({ ...state, status: 'playing' }, .25, woodPolicy);
    expect(state.npcs.slice(2, 4).every(npc => npc.action === 'rest')).toBe(true);
    expect(state.npcs.slice(2, 4).map(npc => npc.mind!.intent.kind)).toContain('strike');
    expect(['recruit', 'strike']).not.toContain(state.npcs[0].mind!.intent.kind);
  });

  it('主动请求过的疲劳诉求不会因冷却和聊天裁剪又从头问起', () => {
    const state = { ...paused(), status: 'playing' as const };
    state.npcs[0].energy = 30; state.social.introduced = true;
    state.social.nextCheckAt = 0; state.social.nextPromptAt = 0;
    updateSocial(state);
    const concernId = state.npcs[0].mind!.concerns.find(concern => concern.kind === 'rest')!.id;
    expect(state.social.people.azhuang.lastConcernPrompts?.rest).toBe(concernId);
    state.social.threads = []; state.elapsed = 40; state.social.nextPromptAt = 0;
    updateSocial(state);
    expect(state.social.threads.some(thread => thread.initiator === 'azhuang' && thread.kind === 'rest')).toBe(false);
    expect(state.npcs[0].mind!.concerns.filter(concern => concern.kind === 'rest')).toHaveLength(1);
  });

  it('林枫长期占据休息位也不会堵住阿壮，后来的真实休息能兑现承诺', () => {
    let state = paused();
    state.npcs[3].position = getTaskDestination('rest', 'linlan');
    state.npcs[3].destination = { ...state.npcs[3].position };
    state.npcs[3].action = 'rest'; state.npcs[3].actionDuration = 100;
    state.npcs[0].energy = 35;
    state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'checkin' });
    state = issueCommand(state, { type: 'social-reply', threadId: state.social.threads.at(-1)!.id, choiceId: 'promise' });
    state = issueCommand(state, { type: 'assign', npcId: 'azhuang', action: 'rest' });
    const policy: PolicyFunction = observation => ({ ...woodPolicy(observation), action: observation.npcId === 'azhuang' ? 'rest' : 'camp' });
    for (let i = 0; i < 100 && state.social.promises[0].status === 'pending'; i++) state = advanceGame({ ...state, status: 'playing' }, .25, policy);
    expect(state.social.promises[0].status).toBe('kept');
    expect(state.npcs[0].completedTasks).toBeGreaterThan(0);
    expect(state.npcs[0].health).toBeGreaterThan(95);
  });

  it('最后的安全集合只改变地点，不把拒工改回服从或奖励信任', () => {
    let state = paused(); state.elapsed = 215; state.npcs[3].energy = 35;
    for (let i = 0; i < 3; i++) recordMindEvent(state, state.npcs[3], 'request_denied', '继续拒绝休息', 'rest');
    const trust = state.npcs[3].trust; const resentment = state.npcs[3].mind!.emotions.resentment;
    state = issueCommand(state, { type: 'assign', npcId: 'linlan', action: 'camp' });
    state = advanceGame({ ...state, status: 'playing' }, .25, woodPolicy);
    expect(state.npcs[3].action).toBe('camp');
    expect(state.npcs[3].mind!.intent.kind).toBe('refuse');
    expect(state.npcs[3].mind!.emotions.resentment).toBeGreaterThan(resentment * .99);
    expect(state.npcs[3].trust).toBe(trust);
    expect(state.decisions.filter(record => record.npcId === 'linlan').at(-1)?.reason).toContain('停工立场');
  });

  it('同一负面经历的道歉只缓和一次，暂停重复和换线程都不能刷信任', () => {
    let state = paused();
    const initialTrust = state.npcs[0].trust;
    state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'checkin' });
    let threadId = state.social.threads.at(-1)!.id;
    for (let i = 0; i < 30; i++) state = issueCommand(state, { type: 'social-chat', threadId, text: '对不起' });
    expect(state.npcs[0].trust).toBe(initialTrust);
    state.npcs[0].energy = 30;
    state = issueCommand(state, { type: 'social-chat', threadId, text: '不准休息，继续干活' });
    const beforeApology = state.npcs[0].trust;
    state = issueCommand(state, { type: 'social-chat', threadId, text: '对不起' });
    const repaired = state.npcs[0].trust;
    expect(repaired).toBeGreaterThan(beforeApology);
    state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'food' });
    threadId = state.social.threads.at(-1)!.id;
    for (let i = 0; i < 30; i++) state = issueCommand(state, { type: 'social-chat', threadId, text: '对不起' });
    expect(state.npcs[0].trust).toBe(repaired);
    expect(state.npcs[0].mind!.concerns.find(concern => concern.kind === 'rest')?.denials).toBe(1);
    expect(state.elapsed).toBe(0);
  });

  it('反复拒绝、口头许可、道歉的组合也不能在没有行动时刷高信任', () => {
    let state = paused(); state.npcs[2].energy = 30;
    const initialTrust = state.npcs[2].trust;
    state = issueCommand(state, { type: 'social-open', npcId: 'laozhou', topic: 'checkin' });
    const threadId = state.social.threads.at(-1)!.id;
    for (let i = 0; i < 50; i++) for (const text of ['不准休息', '去休息', '对不起']) {
      state = issueCommand(state, { type: 'social-chat', threadId, text });
    }
    expect(state.elapsed).toBe(0);
    expect(state.npcs[2].energy).toBe(30);
    expect(state.npcs[2].completedTasks).toBe(0);
    expect(state.npcs[2].trust).toBeLessThanOrEqual(initialTrust);
    expect(state.npcs[2].mind!.concerns.find(concern => concern.kind === 'rest')?.denials).toBe(50);
    expect(state.social.stats.kept).toBe(0);
  });

  it('自主治疗的功劳属于同伴，不增加对没有参与的玩家的信任', () => {
    let state = paused(); state.npcs[2].health = 52; state.npcs[2].injured = true;
    const initialTrust = state.npcs[2].trust;
    const initialAffinity = state.social.relationships.find(relation => relation.from === 'laozhou' && relation.to === 'xiaomi')!.affinity;
    const policy: PolicyFunction = observation => ({ action: observation.npcId === 'xiaomi' && observation.allowed.includes('help') ? 'help' : 'camp',
      emotion: 'calm', source: 'model', latencyMs: 0, scores: ACTIONS.map(action => Number(action === 'help')) });
    for (let i = 0; i < 120 && !state.stats.helps; i++) state = advanceGame({ ...state, status: 'playing' }, .25, policy);
    expect(state.stats.helps).toBe(1);
    expect(state.npcs[2].trust).toBe(initialTrust);
    expect(state.npcs[2].health).toBeGreaterThan(52);
    expect(state.social.relationships.find(relation => relation.from === 'laozhou' && relation.to === 'xiaomi')!.affinity).toBeGreaterThan(initialAffinity);
    expect(state.social.threads.flatMap(thread => thread.lines).some(line => line.speaker === 'player')).toBe(false);
  });

  it.each<ActionId>(['wood', 'food', 'help', 'explore'])('林枫能因可核实的物资和互助收益有条件地接受%s，而非永久逃避', action => {
    const state = paused(); const npc = state.npcs[3];
    npc.energy = 100; npc.health = 100; npc.hunger = 0; npc.trust = 100; npc.command = action;
    state.food = 0; state.wood = 0;
    if (action === 'help') { state.npcs[0].health = 35; state.npcs[0].injured = true; }
    const baseline = { action, emotion: 'calm' as const, source: 'model' as const, latencyMs: 0, scores: ACTIONS.map(id => Number(id === action)) };
    const decision = decideCampBehavior(state, npc, baseline, getAllowedActions(state, npc));
    expect(decision.result.action).toBe('food');
    expect(decision.result.reason).toContain('生存库存');
    expect(decision.decision.intent).toBe('cooperate');
    expect(state.stats.gatheredWood + state.stats.gatheredFood).toBe(0);
    expect(state.food).toBe(0);
  });

  it('库存充足时仍然懒惰，有未解决的拒绝经历时高收益也不抹掉抗拒', () => {
    const state = paused(); const npc = state.npcs[3]; npc.command = 'wood'; npc.energy = 100; npc.trust = 100;
    const baseline = { action: 'wood' as const, emotion: 'calm' as const, source: 'model' as const, latencyMs: 0, scores: ACTIONS.map(id => Number(id === 'wood')) };
    expect(decideCampBehavior(state, npc, baseline, getAllowedActions(state, npc)).decision.intent).toBe('evade');
    npc.energy = 30; state.wood = 0; state.fire = 20;
    for (let i = 0; i < 3; i++) recordMindEvent(state, npc, 'request_denied', '仍然不准休息', 'rest');
    const decision = decideCampBehavior(state, npc, baseline, getAllowedActions(state, npc));
    expect(decision.decision.intent).toBe('refuse');
    expect(decision.result.action).toBe('rest');
  });

  it('文字解析只执行清晰安排，不把疑问、引用或矛盾措辞当命令', () => {
    expect(parsePlayerIntent('现在就去休息')).toBe('grant_rest');
    expect(parsePlayerIntent('不准休息，继续干活')).toBe('deny_rest');
    expect(parsePlayerIntent('抱歉，是我安排得不妥')).toBe('apologize');
    for (const text of ['如果不让休息会怎样？', '他说“不准休息”', '休息还是干活？', '不要再说“继续干活”了']) expect(parsePlayerIntent(text)).toBeNull();
  });
});
