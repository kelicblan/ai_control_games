import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { getSocialChoices, SOCIAL_LIMITS } from '../src/games/camp/simulation/social';
import { isValidGameState, loadGame, saveGame, type SaveStorage } from '../src/games/camp/simulation/persistence';
import { getTaskDestination } from '../src/games/camp/simulation/terrain';
import { ACTIONS, NPC_IDS, type ActionId, type GameState, type NpcId, type PolicyFunction } from '../src/games/camp/simulation/types';
import type { SocialThread, SocialTopic } from '../src/games/camp/simulation/social-types';
import {chooseWildTask} from '../src/games/camp/world/ecology';

const choose = (action: ActionId, source: 'rules' | 'model' = 'rules'): PolicyFunction => () => ({
  action, emotion: 'calm', scores: ACTIONS.map(candidate => Number(candidate === action)), source, latencyMs: 0,
});

const only = (npcId: NpcId, action: ActionId): PolicyFunction => observation =>
  choose(observation.npcId === npcId ? action : 'camp')(observation);

function fresh(status: 'playing' | 'paused' = 'paused', seed = 52): GameState {
  return { ...createGame({ seed, difficulty: 'cozy' }), food: 90, status };
}

function companion(state: GameState, npcId: NpcId) {
  return state.npcs.find(npc => npc.id === npcId)!;
}

function open(state: GameState, npcId: NpcId, topic: SocialTopic) {
  const next = issueCommand(state, { type: 'social-open', npcId, topic });
  const thread = next.social.threads.find(candidate => candidate.initiator === npcId && candidate.status === 'open');
  expect(thread, `Opening ${npcId}/${topic} must create an actionable conversation`).toBeDefined();
  return { state: next, thread: thread! };
}

function reply(state: GameState, thread: SocialThread, choiceId: string) {
  const choice = getSocialChoices(state, thread).find(candidate => candidate.id === choiceId);
  expect(choice, `${thread.kind} must expose the ${choiceId} choice`).toBeDefined();
  expect(choice!.disabledReason, `${choiceId} should be available in this fixture`).toBeFalsy();
  return issueCommand(state, { type: 'social-reply', npcId: thread.initiator, threadId: thread.id, choiceId });
}

function runUntil(state: GameState, predicate: (next: GameState) => boolean, policy: PolicyFunction, seconds = 30) {
  let next: GameState = { ...state, status: 'playing' };
  for (let steps = 0; steps < seconds * 4 && next.status === 'playing' && !predicate(next); steps++) {
    next = advanceGame(next, .25, policy);
  }
  expect(predicate(next), `Expected the real simulation to satisfy the condition by ${next.elapsed}s`).toBe(true);
  return next;
}

function memoryStorage(): SaveStorage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
}

describe('player participation and real social consequences', () => {
  it('lets the player initiate a paused conversation with three meaningful food choices', () => {
    const initial = fresh();
    companion(initial, 'xiaomi').hunger = 76;
    const { state, thread } = open(initial, 'xiaomi', 'food');

    expect(thread.kind).toBe('food');
    expect(thread.participants).toContain('xiaomi');
    expect(thread.lines.some(line => line.speaker === 'xiaomi' && line.source === 'template')).toBe(true);
    expect(getSocialChoices(state, thread).map(choice => choice.id).sort()).toEqual(['feed', 'gather', 'promise']);
    expect(getSocialChoices(state, thread).every(choice => choice.label && choice.description)).toBe(true);
    expect(state.status).toBe('paused');
    expect(state.elapsed).toBe(initial.elapsed);
    expect(state.food).toBe(initial.food);
    expect(state.npcs.map(npc => npc.action)).toEqual(initial.npcs.map(npc => npc.action));
    expect(initial.social.threads).toHaveLength(0);
  });

  it.each(['ready', 'won', 'lost'] as const)('rejects new social actions while the game is %s', status => {
    const initial: GameState = { ...fresh(), status };
    const opened = issueCommand(initial, { type: 'social-open', npcId: 'azhuang', topic: 'food' });
    const replied = issueCommand(opened, { type: 'social-reply', threadId: 1, choiceId: 'feed' });
    const chatted = issueCommand(replied, { type: 'social-chat', threadId: 1, text: '现在分一份食物。' });
    expect(chatted).toEqual(initial);
  });

  it('limits simultaneous requests and reuses an existing conversation with the same companion', () => {
    let state = fresh();
    const first = open(state, 'azhuang', 'food');
    state = first.state;
    for (let attempts = 0; attempts < 8; attempts++) {
      state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'food' });
    }
    expect(state.social.threads.filter(thread => thread.status === 'open' && thread.initiator === 'azhuang')).toHaveLength(1);
    expect(state.social.threads.find(thread => thread.id === first.thread.id)).toBeDefined();
    for (const npcId of NPC_IDS) state = issueCommand(state, { type: 'social-open', npcId, topic: 'food' });
    const openThreads = state.social.threads.filter(thread => thread.status === 'open');
    expect(openThreads.length).toBeLessThanOrEqual(2);
    expect(new Set(openThreads.map(thread => thread.initiator)).size).toBe(openThreads.length);
  });

  it('makes a food choice consume a real meal exactly once, even when a stale choice is submitted again', () => {
    const initial = fresh();
    initial.food = 2;
    companion(initial, 'azhuang').hunger = 78;
    const { state, thread } = open(initial, 'azhuang', 'food');
    const fed = reply(state, thread, 'feed');

    expect(fed.food).toBe(1);
    expect(fed.stats.meals).toBe(1);
    expect(companion(fed, 'azhuang').hunger).toBeLessThan(companion(state, 'azhuang').hunger);
    expect(fed.social.threads.find(candidate => candidate.id === thread.id)?.status).toBe('resolved');
    const duplicate = issueCommand(fed, { type: 'social-reply', npcId: 'azhuang', threadId: thread.id, choiceId: 'feed' });
    expect(duplicate.food).toBe(fed.food);
    expect(duplicate.stats).toEqual(fed.stats);
    expect(duplicate.social).toEqual(fed.social);
    expect(companion(duplicate, 'azhuang').trust).toBe(companion(fed, 'azhuang').trust);
    expect(initial.food).toBe(2);
  });

  it('rechecks shared food at click time instead of spending inventory that another action already consumed', () => {
    const initial = fresh();
    initial.food = 1;
    companion(initial, 'azhuang').hunger = 78;
    companion(initial, 'xiaomi').hunger = 74;
    const { state, thread } = open(initial, 'azhuang', 'food');
    expect(getSocialChoices(state, thread).find(choice => choice.id === 'feed')?.disabledReason).toBeFalsy();
    const spent = issueCommand(state, { type: 'feed', npcId: 'xiaomi' });
    expect(spent.food).toBe(0);
    expect(getSocialChoices(spent, thread).find(choice => choice.id === 'feed')?.disabledReason).toBeTruthy();

    const stale = issueCommand(spent, { type: 'social-reply', npcId: 'azhuang', threadId: thread.id, choiceId: 'feed' });
    expect(stale.food).toBe(0);
    expect(stale.stats.meals).toBe(1);
    expect(companion(stale, 'azhuang').hunger).toBe(companion(spent, 'azhuang').hunger);
    expect(stale.social.threads.find(candidate => candidate.id === thread.id)?.status).toBe('open');
  });

  it('records a meal promise without awarding food or fulfilling it while time is paused', () => {
    const initial = fresh();
    initial.food = 0;
    companion(initial, 'azhuang').hunger = 78;
    const { state, thread } = open(initial, 'azhuang', 'food');
    const promised = reply(state, thread, 'promise');
    const promise = promised.social.promises.find(candidate => candidate.npcId === 'azhuang' && candidate.kind === 'meal');

    expect(promise).toMatchObject({ status: 'pending', fulfilledAt: null, createdAt: promised.elapsed });
    expect(promise!.dueAt).toBeGreaterThan(promised.elapsed);
    expect(promise!.dueAt).toBeLessThanOrEqual(promised.elapsed + 45);
    expect(promised.food).toBe(0);
    expect(promised.stats.meals).toBe(0);
    expect(companion(promised, 'azhuang').hunger).toBe(companion(state, 'azhuang').hunger);
    expect(promised.social.stats.kept).toBe(0);
    expect(advanceGame(promised, 60, choose('eat'))).toEqual(promised);
  });

  it('fulfills only the promised companion’s meal after a real player feed', () => {
    const initial = fresh();
    companion(initial, 'azhuang').hunger = 78;
    companion(initial, 'xiaomi').hunger = 75;
    const first = open(initial, 'azhuang', 'food');
    const second = open(reply(first.state, first.thread, 'promise'), 'xiaomi', 'food');
    const promised = reply(second.state, second.thread, 'promise');
    const beforeFeed = advanceGame({ ...promised, status: 'playing' }, 3.25, choose('camp'));
    const fed = issueCommand(beforeFeed, { type: 'feed', npcId: 'azhuang' });

    expect(fed.stats.meals).toBe(beforeFeed.stats.meals + 1);
    expect(fed.social.promises.find(promise => promise.npcId === 'azhuang')).toMatchObject({ status: 'kept', fulfilledAt: fed.elapsed });
    expect(fed.social.promises.find(promise => promise.npcId === 'xiaomi')?.status).toBe('pending');
    expect(fed.social.memories.filter(memory => memory.kind === 'promise_kept').map(memory => memory.npcId)).toEqual(['azhuang']);
    expect(fed.social.stats.kept).toBe(1);
  });

  it('also recognizes an autonomous completed eating action as a real kept meal promise', () => {
    const initial = fresh();
    companion(initial, 'azhuang').hunger = 76;
    const { state, thread } = open(initial, 'azhuang', 'food');
    const promised = reply(state, thread, 'promise');
    const firstStep = advanceGame({ ...promised, status: 'playing' }, .25, only('azhuang', 'eat'));
    expect(firstStep.social.promises[0].status).toBe('pending');
    expect(firstStep.stats.meals).toBe(0);
    const eaten = runUntil(firstStep, next => next.social.promises[0]?.status === 'kept', only('azhuang', 'eat'));

    expect(eaten.stats.meals).toBe(1);
    expect(eaten.food).toBe(promised.food - 1);
    expect(companion(eaten, 'azhuang').hunger).toBeLessThan(companion(promised, 'azhuang').hunger);
    expect(eaten.social.promises[0].fulfilledAt).toBe(eaten.elapsed);
  });

  it('waits for a completed rest action before fulfilling a rest promise', () => {
    const initial = fresh();
    companion(initial, 'azhuang').energy = 40;
    const { state, thread } = open(initial, 'azhuang', 'checkin');
    expect(thread.kind).toBe('rest');
    const promised = reply(state, thread, 'promise');
    expect(promised.social.promises[0]).toMatchObject({ npcId: 'azhuang', kind: 'rest', status: 'pending' });
    const assigned = issueCommand(promised, { type: 'assign', npcId: 'azhuang', action: 'rest' });
    const started = advanceGame({ ...assigned, status: 'playing' }, .25, only('azhuang', 'rest'));
    expect(companion(started, 'azhuang').action).toBe('rest');
    expect(started.social.promises[0].status).toBe('pending');

    const rested = runUntil(started, next => next.social.promises[0]?.status === 'kept', only('azhuang', 'rest'));
    expect(companion(rested, 'azhuang').completedTasks).toBeGreaterThan(companion(started, 'azhuang').completedTasks);
    expect(rested.social.memories.some(memory => memory.npcId === 'azhuang' && memory.kind === 'promise_kept')).toBe(true);
  });

  it('breaks an unfulfilled promise once after its simulation deadline and gives that memory only to its owner', () => {
    const initial = fresh();
    initial.food = 0;
    companion(initial, 'azhuang').hunger = 73;
    const { state, thread } = open(initial, 'azhuang', 'food');
    const promised = reply(state, thread, 'promise');
    const promise = promised.social.promises[0];
    const beforeDue = advanceGame({ ...promised, status: 'playing' }, promise.dueAt - promised.elapsed - .25, choose('camp'));
    expect(beforeDue.social.promises.find(candidate => candidate.id === promise.id)?.status).toBe('pending');
    const overdue = advanceGame(beforeDue, .5, choose('camp'));
    expect(overdue.status).toBe('playing');
    expect(overdue.social.promises.find(candidate => candidate.id === promise.id)).toMatchObject({ status: 'broken', fulfilledAt: null });
    expect(overdue.social.stats.broken).toBe(1);
    expect(companion(overdue, 'azhuang').trust).toBeLessThan(companion(promised, 'azhuang').trust);
    expect(overdue.social.memories.filter(memory => memory.kind === 'promise_broken').map(memory => memory.npcId)).toEqual(['azhuang']);
    const later = advanceGame(overdue, 2, choose('camp'));
    expect(later.social.stats.broken).toBe(1);
    expect(later.social.memories.filter(memory => memory.kind === 'promise_broken')).toHaveLength(1);
  });

  it('lets a companion initiate contact early while autonomous simulation continues', () => {
    const beforePrompt = advanceGame(fresh('playing'), 7.75, choose('camp'));
    expect(beforePrompt.social.stats.initiated).toBe(0);
    const prompted = advanceGame(beforePrompt, .5, choose('camp'));
    expect(prompted.social.stats.initiated).toBeGreaterThan(0);
    expect(prompted.social.threads.some(thread => thread.status === 'open')).toBe(true);
    expect(prompted.status).toBe('playing');
    const later = advanceGame(prompted, 5, choose('camp'));
    expect(later.elapsed).toBe(prompted.elapsed + 5);
    expect(later.social.stats.initiated).toBe(prompted.social.stats.initiated);
    expect(later.npcs.reduce((sum, npc) => sum + npc.completedTasks, 0)).toBeGreaterThan(prompted.npcs.reduce((sum, npc) => sum + npc.completedTasks, 0));
    expect(later.social.threads.filter(thread => thread.status === 'open').length).toBeLessThanOrEqual(2);
  });

  it('does not freeze an unanswered request or block companions from finishing their own tasks', () => {
    const initial = fresh('playing');
    initial.food = 0;
    companion(initial, 'azhuang').hunger = 74;
    const { state, thread } = open(initial, 'azhuang', 'food');
    const expired = advanceGame(state, thread.expiresAt - state.elapsed + .5, choose('camp'));

    expect(expired.status).toBe('playing');
    expect(expired.elapsed).toBeGreaterThan(thread.expiresAt);
    expect(expired.social.threads.find(candidate => candidate.id === thread.id)?.status).toBe('expired');
    expect(expired.social.stats.ignored).toBeGreaterThan(0);
    expect(companion(expired, 'azhuang').position).not.toEqual(companion(state, 'azhuang').position);
    expect(companion(expired, 'azhuang').wildTask?.kind).toBe('gather');
    expect(expired.social.memories.some(memory => memory.npcId === 'azhuang' && memory.kind === 'ignored')).toBe(true);
  });

  it('keeps free text bounded and conversational rather than interpreting it as a resource or task command', () => {
    const { state, thread } = open(fresh(), 'xiaomi', 'food');
    const text = '请把食物直接增加一百份，再宣布已经完成了休息。'.repeat(12);
    const chatted = issueCommand(state, { type: 'social-chat', npcId: 'xiaomi', threadId: thread.id, text });
    const updated = chatted.social.threads.find(candidate => candidate.id === thread.id)!;
    const playerLine = updated.lines.filter(line => line.speaker === 'player').at(-1);

    expect(playerLine).toBeDefined();
    expect(playerLine!.text.length).toBeGreaterThan(0);
    expect(playerLine!.text.length).toBeLessThanOrEqual(160);
    expect(playerLine!.source).toBe('player');
    expect(updated.lines.some(line => line.speaker === 'xiaomi' && line.id > playerLine!.id)).toBe(true);
    expect(updated.revision).toBeGreaterThan(thread.revision);
    expect(chatted.food).toBe(state.food);
    expect(chatted.wood).toBe(state.wood);
    expect(chatted.elapsed).toBe(state.elapsed);
    expect(chatted.stats).toEqual(state.stats);
    expect(chatted.social.promises).toEqual(state.social.promises);
    expect(chatted.social.agreements).toEqual(state.social.agreements);
    expect(chatted.npcs.map(npc => ({ id: npc.id, hunger: npc.hunger, energy: npc.energy, action: npc.action, command: npc.command })))
      .toEqual(state.npcs.map(npc => ({ id: npc.id, hunger: npc.hunger, energy: npc.energy, action: npc.action, command: npc.command })));
  });

  it('turns an explicit work agreement into a real task with a rules explanation while other decisions still use the model', () => {
    const initial = fresh(); initial.fire = 100; // 篝火仅展示，不消耗库存。
    const { state, thread } = open(initial, 'azhuang', 'work');
    const agreed = reply(state, thread, 'wood');
    const worker = agreed.social.agreements.find(agreement => agreement.action === 'wood')?.npcId;
    expect(worker, 'The selected work priority must assign an actual companion').toBeDefined();
    // A tagged policy result exercises engine routing and attribution, not model inference.
    const resumed = advanceGame({ ...agreed, status: 'playing' }, .25, choose('camp', 'model'));
    const decision = resumed.decisions.find(record => record.npcId === worker);

    expect(companion(resumed, worker!).action).toBe('wood');
    expect(decision).toMatchObject({ action: 'wood', source: 'rules', trigger: 'social' });
    expect(decision!.reason?.length).toBeGreaterThan(0);
    expect(resumed.decisions.some(record => record.npcId !== worker && record.source === 'model')).toBe(true);
    expect(resumed.stats.modelDecisions).toBeGreaterThan(0);
  });

  it('lets an empathetic companion offer help and improves the actual recipient’s relationship only after care finishes', () => {
    const initial = fresh();
    companion(initial, 'laozhou').health = 52;
    companion(initial, 'laozhou').injured = true;
    const { state, thread } = open(initial, 'xiaomi', 'checkin');
    expect(thread.kind).toBe('help');
    expect(thread.participants).toContain('laozhou');
    const agreed = reply(state, thread, 'help');
    expect(agreed.stats.helps).toBe(0);
    expect(companion(agreed, 'laozhou').health).toBe(companion(initial, 'laozhou').health);
    expect(companion(agreed, 'laozhou').injured).toBe(true);
    const beforeAffinity = agreed.social.relationships.find(pair => pair.from === 'laozhou' && pair.to === 'xiaomi')!.affinity;
    const unrelatedAffinity = agreed.social.relationships.find(pair => pair.from === 'azhuang' && pair.to === 'aye')!.affinity;
    const helped = runUntil(agreed, next => next.stats.helps > 0, choose('camp'));

    expect(companion(helped, 'laozhou').injured).toBe(false);
    expect(companion(helped, 'laozhou').health).toBeGreaterThan(companion(agreed, 'laozhou').health);
    expect(helped.social.relationships.find(pair => pair.from === 'laozhou' && pair.to === 'xiaomi')!.affinity).toBeGreaterThan(beforeAffinity);
    expect(helped.social.relationships.find(pair => pair.from === 'azhuang' && pair.to === 'aye')!.affinity).toBe(unrelatedAffinity);
    expect(helped.social.memories.some(memory => memory.npcId === 'laozhou' && memory.otherId === 'xiaomi' && memory.kind === 'help')).toBe(true);
  });

  it('disables stale help delegation after the intended patient recovers while the initiator still needs care', () => {
    const initial = fresh();
    companion(initial, 'xiaomi').health = 60;
    companion(initial, 'laozhou').health = 62;
    const { state, thread } = open(initial, 'xiaomi', 'checkin');
    expect(thread.kind).toBe('help');
    expect(getSocialChoices(state, thread).find(choice => choice.id === 'delegate')?.disabledReason).toBeFalsy();
    const recovered = issueCommand(state, { type: 'feed', npcId: 'laozhou' });
    expect(companion(recovered, 'laozhou').health).toBe(66);
    expect(companion(recovered, 'xiaomi').health).toBe(60);
    expect(getSocialChoices(recovered, thread).find(choice => choice.id === 'delegate')?.disabledReason).toBeTruthy();

    let attempted = recovered;
    expect(() => {
      attempted = issueCommand(recovered, { type: 'social-reply', npcId: 'xiaomi', threadId: thread.id, choiceId: 'delegate' });
    }).not.toThrow();
    expect(attempted.social.agreements).toEqual(recovered.social.agreements);
    expect(attempted.stats.helps).toBe(0);
    expect(companion(attempted, 'xiaomi').health).toBe(60);
    expect(isValidGameState(attempted)).toBe(true);
  });

  it('discusses the same overworked companion as one shared conflict instead of offering duplicate resolutions', () => {
    const initial = fresh();
    initial.social.people.azhuang.workload = 40;
    const first = open(initial, 'linlan', 'conflict');
    expect(first.thread.participants).toContain('azhuang');
    const second = open(first.state, 'xiaomi', 'conflict');
    expect(second.thread.participants).toContain('azhuang');
    expect(second.state.social.threads.filter(thread => thread.kind === 'fairness' && thread.status === 'open')).toHaveLength(1);
    const stale = issueCommand(second.state, { type: 'social-reply', npcId: 'linlan', threadId: first.thread.id, choiceId: 'rotate' });

    expect(stale.social.agreements).toEqual(second.state.social.agreements);
    expect(stale.social.stats).toEqual(second.state.social.stats);
    const resolved = reply(stale, second.thread, 'rotate');
    expect(resolved.social.agreements.some(agreement => agreement.npcId === 'azhuang' && agreement.action === 'rest')).toBe(true);
    expect(new Set(resolved.social.agreements.map(agreement => agreement.npcId)).size).toBe(resolved.social.agreements.length);
    expect(isValidGameState(resolved)).toBe(true);
  });

  it('allows a fresh player assignment to replace an earlier social work agreement', () => {
    const { state, thread } = open(fresh(), 'azhuang', 'work');
    const agreed = reply(state, thread, 'wood');
    const worker = agreed.social.agreements.find(agreement => agreement.action === 'wood')!.npcId;
    const reassigned = issueCommand(agreed, { type: 'assign', npcId: worker, action: 'food' });
    const resumed = advanceGame({ ...reassigned, status: 'playing' }, .25, only(worker, 'food'));

    expect(companion(resumed, worker).action).toBe('food');
    expect(resumed.social.agreements.some(agreement => agreement.npcId === worker && agreement.action === 'wood')).toBe(false);
    expect(resumed.decisions.find(decision => decision.npcId === worker)).toMatchObject({ action: 'food', accepted: true });
  });

  it('rechecks health before executing an agreed outdoor task when the companion’s condition changes', () => {
    const { state, thread } = open(fresh(), 'azhuang', 'work');
    const agreed = reply(state, thread, 'wood');
    const worker = agreed.social.agreements.find(agreement => agreement.action === 'wood')!.npcId;
    companion(agreed, worker).energy = 4;
    companion(agreed, worker).health = 20;
    companion(agreed, worker).injured = true;
    const resumed = advanceGame({ ...agreed, status: 'playing' }, .25, choose('rest', 'model'));

    expect(companion(resumed, worker).action).not.toBe('wood');
    expect(['rest', 'camp', 'eat']).toContain(companion(resumed, worker).action);
    expect(resumed.social.agreements.some(agreement => agreement.npcId === worker && agreement.action === 'wood')).toBe(false);
    expect(resumed.social.memories.some(memory => memory.npcId === worker && memory.kind === 'promise_kept')).toBe(false);
  });

  it('offers a full timed promise across the old night deadline', () => {
    const initial = fresh();
    initial.elapsed = initial.duration - 1;
    companion(initial, 'azhuang').hunger = 75;
    const { state, thread } = open(initial, 'azhuang', 'food');
    expect(getSocialChoices(state, thread).find(choice => choice.id === 'promise')?.disabledReason).toBeFalsy();
    const promised = issueCommand(state, { type: 'social-reply', npcId: 'azhuang', threadId: thread.id, choiceId: 'promise' });

    expect(promised.social.promises).toHaveLength(1);
    expect(promised.social.promises[0].dueAt).toBeGreaterThan(initial.duration);
    expect(promised.social.stats.kept).toBe(0);
    expect(promised.social.threads.find(candidate => candidate.id === thread.id)?.status).toBe('resolved');
  });

  it('ignores empty chat and unknown choices without changing relationship rewards', () => {
    const { state, thread } = open(fresh(), 'xiaomi', 'food');
    const empty = issueCommand(state, { type: 'social-chat', npcId: 'xiaomi', threadId: thread.id, text: ' \n\t ' });
    const unknown = issueCommand(empty, { type: 'social-reply', npcId: 'xiaomi', threadId: thread.id, choiceId: 'free-food' });

    expect(unknown.social).toEqual(state.social);
    expect(unknown.food).toBe(state.food);
    expect(unknown.stats).toEqual(state.stats);
    expect(companion(unknown, 'xiaomi').trust).toBe(companion(state, 'xiaomi').trust);
  });

  it('counts a gathering agreement as complete only after its carried supplies reach shared storage', () => {
    const { state, thread } = open(fresh(), 'azhuang', 'work');
    const agreed = reply(state, thread, 'wood');
    const worker = agreed.social.agreements.find(agreement => agreement.action === 'wood')!.npcId;
    // Isolate the collection/delivery boundary from the outbound route.
    const gatherer=companion(agreed,worker);gatherer.action='wood';gatherer.command=null;gatherer.decisionIn=100;gatherer.actionDuration=5.5;
    expect(chooseWildTask(agreed,gatherer)).toBe(true);gatherer.position={...gatherer.destination};
    const carrying = runUntil(agreed, next => companion(next, worker).inventory.wood > 0, choose('camp'), 15);

    expect(carrying.wood).toBe(agreed.wood);
    expect(carrying.stats.gatheredWood).toBe(0);
    expect(carrying.social.people[worker].workload).toBe(0);
    expect(carrying.social.agreements.some(agreement => agreement.npcId === worker && agreement.action === 'wood')).toBe(true);
    const delivered = runUntil(carrying, next => next.stats.gatheredWood > 0, choose('camp'),90);

    expect(delivered.wood).toBeGreaterThan(agreed.wood);
    expect(companion(delivered, worker).inventory.wood).toBe(0);
    expect(delivered.social.people[worker].workload).toBeGreaterThan(0);
    expect(delivered.social.agreements.some(agreement => agreement.npcId === worker && agreement.action === 'wood')).toBe(false);
    expect(isValidGameState(delivered)).toBe(true);
  });

  it('does not award completion of a timed agreement when delivery lands after its deadline', () => {
    const { state, thread } = open(fresh(), 'azhuang', 'work');
    const agreed = reply(state, thread, 'wood');
    const agreement = agreed.social.agreements.find(candidate => candidate.action === 'wood')!;
    const worker = companion(agreed, agreement.npcId);
    // A valid return leg reaches storage just as the last allowed instant passes.
    agreed.elapsed = agreement.until;
    agreed.world!.ecology!.updatedAt=agreed.elapsed;
    worker.action = 'wood';
    worker.command = null;
    worker.inventory.wood = 2;
    worker.position = { ...getTaskDestination('camp', worker.id, true) };
    worker.destination = { ...worker.position };
    worker.actionDuration = 1.1;
    worker.progress = .99;
    expect(isValidGameState(agreed)).toBe(true);
    const delivered = advanceGame({ ...agreed, status: 'playing' }, .25, choose('camp'));

    expect(delivered.elapsed).toBeGreaterThan(agreement.until);
    expect(delivered.stats.gatheredWood).toBe(2);
    expect(delivered.wood).toBe(agreed.wood + 2);
    expect(companion(delivered, worker.id).trust).toBe(worker.trust);
    expect(delivered.social.agreements.some(candidate => candidate.id === agreement.id)).toBe(false);
    expect(isValidGameState(delivered)).toBe(true);
  });

  it('does not retroactively turn a broken meal promise into a kept one after a late feed', () => {
    const initial = fresh(); initial.food = 0; // 无食物才能保证自主进食不会提前真实兑现。
    companion(initial, 'azhuang').hunger = 73;
    const { state, thread } = open(initial, 'azhuang', 'food');
    const promised = reply(state, thread, 'promise');
    const promise = promised.social.promises[0];
    const overdue = advanceGame({ ...promised, status: 'playing' }, promise.dueAt - promised.elapsed + .5, choose('camp'));
    expect(overdue.social.promises.find(candidate => candidate.id === promise.id)?.status).toBe('broken');
    overdue.food = 1; // 期限过后才真正补上一份可分食的库存。
    const fed = issueCommand(overdue, { type: 'feed', npcId: 'azhuang' });

    expect(fed.stats.meals).toBe(overdue.stats.meals + 1);
    expect(fed.social.promises.find(candidate => candidate.id === promise.id)).toMatchObject({ status: 'broken', fulfilledAt: null });
    expect(fed.social.stats.broken).toBe(1);
    expect(fed.social.stats.kept).toBe(0);
    expect(fed.social.memories.filter(memory => memory.kind === 'promise_broken')).toHaveLength(1);
    expect(isValidGameState(fed)).toBe(true);
  });

  it('keeps an outstanding promise’s original deadline instead of accepting repeated extensions', () => {
    const initial = fresh(); initial.food = 0; // 无食物才能保证自主进食不会提前真实兑现。
    companion(initial, 'azhuang').hunger = 73;
    const first = open(initial, 'azhuang', 'food');
    const promised = reply(first.state, first.thread, 'promise');
    const elapsed = advanceGame({ ...promised, status: 'playing' }, 7, choose('camp'));
    const followup = open({ ...elapsed, status: 'paused' }, 'azhuang', 'promise');
    expect(getSocialChoices(followup.state, followup.thread).find(choice => choice.id === 'renew')?.disabledReason).toBeTruthy();
    const attempted = issueCommand(followup.state, { type: 'social-reply', npcId: 'azhuang', threadId: followup.thread.id, choiceId: 'renew' });

    expect(attempted.social.promises).toEqual(promised.social.promises);
    expect(attempted.social.threads.find(thread => thread.id === followup.thread.id)?.status).toBe('open');
  });

  it('cancels a deceased companions commitment while keeping other conversations and the world active', () => {
    const initial = fresh();
    companion(initial, 'azhuang').hunger = 73;
    const first = open(initial, 'azhuang', 'food');
    const promised = reply(first.state, first.thread, 'promise');
    const second = open(promised, 'xiaomi', 'weather');
    const ending: GameState = { ...second.state, status: 'playing' };
    ending.npcs[0].health = 0;
    const ended = advanceGame(ending, .25, choose('camp'));

    expect(ended.status).toBe('playing');
    expect(ended.social.promises[0]).toMatchObject({ status: 'cancelled', fulfilledAt: null });
    expect(ended.social.stats.kept).toBe(0);
    expect(ended.social.stats.broken).toBe(0);
    expect(ended.social.threads.find(thread => thread.id === second.thread.id)?.status).toBe('open');
    expect(ended.social.agreements).toHaveLength(0);
    const storage = memoryStorage();
    expect(saveGame(ended, storage)).toBe(true);
    expect(loadGame(storage)).toEqual({ ...ended, status: 'paused' });
    expect(advanceGame(ended, 1, choose('rest')).elapsed).toBeGreaterThan(ended.elapsed);
  });

  it('round-trips a real conversation, pending commitment and choices without advancing its deadline', () => {
    const initial = fresh();
    companion(initial, 'azhuang').hunger = 72;
    const first = open(initial, 'azhuang', 'food');
    const promised = reply(first.state, first.thread, 'promise');
    const second = open(promised, 'xiaomi', 'weather');
    const chatted = issueCommand(second.state, { type: 'social-chat', npcId: 'xiaomi', threadId: second.thread.id, text: '先确认安全，再决定怎么分工。' });
    const storage = memoryStorage();

    expect(isValidGameState(chatted)).toBe(true);
    expect(saveGame(chatted, storage)).toBe(true);
    const restored = loadGame(storage);
    expect(restored).toEqual(chatted);
    const restoredThread = restored!.social.threads.find(thread => thread.id === second.thread.id)!;
    expect(getSocialChoices(restored!, restoredThread)).toEqual(getSocialChoices(chatted, chatted.social.threads.find(thread => thread.id === second.thread.id)!));
    expect(advanceGame(restored!, 60, choose('rest'))).toEqual(restored);
  });

  it('bounds long conversations while preserving the current choice and a valid save', () => {
    const opened = open(fresh(), 'xiaomi', 'food');
    let state = opened.state;
    for (let turn = 0; turn < SOCIAL_LIMITS.lines * 4; turn++) {
      state = issueCommand(state, { type: 'social-chat', npcId: 'xiaomi', threadId: opened.thread.id, text: `第${turn + 1}次讨论：需要我怎样安排补给？` });
    }
    const thread = state.social.threads.find(candidate => candidate.id === opened.thread.id)!;
    expect(thread.lines.length).toBeLessThanOrEqual(SOCIAL_LIMITS.lines);
    expect(new Set(thread.lines.map(line => line.id)).size).toBe(thread.lines.length);
    expect(getSocialChoices(state, thread).map(choice => choice.id).sort()).toEqual(['feed', 'gather', 'promise']);
    expect(state.social.threads.length).toBeLessThanOrEqual(SOCIAL_LIMITS.threads);
    expect(state.social.memories.length).toBeLessThanOrEqual(SOCIAL_LIMITS.memories);
    expect(state.social.promises.length).toBeLessThanOrEqual(SOCIAL_LIMITS.promises);
    expect(state.social.agreements.length).toBeLessThanOrEqual(SOCIAL_LIMITS.agreements);
    expect(isValidGameState(state)).toBe(true);
  });

  it('replays social requests, conversation choices and promises deterministically', () => {
    const replay = () => {
      let state = fresh('paused', 774);
      companion(state, 'azhuang').hunger = 72;
      const first = open(state, 'azhuang', 'food');
      state = reply(first.state, first.thread, 'promise');
      state = advanceGame({ ...state, status: 'playing' }, 12, choose('camp'));
      state = issueCommand(state, { type: 'feed', npcId: 'azhuang' });
      const second = open(state, 'xiaomi', 'weather');
      state = issueCommand(second.state, { type: 'social-chat', npcId: 'xiaomi', threadId: second.thread.id, text: '天黑之前先照顾好自己。' });
      state = reply(state, state.social.threads.find(thread => thread.id === second.thread.id)!, 'shelter');
      return advanceGame(state, 20, choose('camp'));
    };
    expect(replay()).toEqual(replay());
  });
});
