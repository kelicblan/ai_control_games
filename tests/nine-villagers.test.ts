import { describe, expect, it } from 'vitest';
import { createMind, decideBehavior, receiveEvent, updateMind } from '../packages/npc-core/src';
import type { ActionOffer, MindObservation } from '../packages/npc-core/src';
import { CAMP_PROFILES, getCampProfile } from '../src/games/camp/npc/profiles';
import { personalityAcknowledgement, personalityCheckin, personalityExpression } from '../src/games/camp/npc/personality-expression';
import { createNpc, NPC_PROFILES } from '../src/games/camp/simulation/constants';
import { NPC_IDS, type NpcId } from '../src/games/camp/simulation/types';
import { createSocialState, SOCIAL_LIMITS } from '../src/games/camp/simulation/social';
import { createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { worldCanTraverse } from '../src/games/camp/world/navigation';
import { CAMP_SETTINGS_CATALOG } from '../src/games/camp/settings/catalog';
import { campExpression } from '../src/games/camp/npc/phrases';

const observe = (changes: Partial<MindObservation> = {}): MindObservation => ({ now: 0,
  needs: { fatigue: .1, hunger: .1, pain: 0, exposure: 0 }, workload: .1, unfairness: 0,
  trustInAuthority: .7, peers: [], ...changes });
const work: ActionOffer[] = [
  { id: 'wood', kind: 'work', effort: .8, risk: .1, selfBenefit: .1, groupBenefit: .9, baseline: 1 },
  { id: 'rest', kind: 'rest', effort: 0, risk: 0, selfBenefit: .8, groupBenefit: 0, baseline: .1 },
];
function decide(id: NpcId, context: MindObservation, offers: ActionOffer[]) {
  const profile = CAMP_PROFILES[id];
  return decideBehavior(createMind(profile, 0, 27), profile, context, offers);
}

describe('nine villagers with real numeric personalities', () => {
  it('keeps the first five stable identities and gives all nine distinct bounded profiles', () => {
    expect(NPC_IDS.slice(0, 5)).toEqual(['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye']);
    expect(NPC_IDS.slice(0, 5).map(id => Object.values(CAMP_PROFILES[id].traits))).toEqual([
      [.82, .6, .9, .3, .5, .54, .8, .72, .9],
      [.78, .72, .94, .28, .18, .35, .84, .58, .27],
      [.24, .26, .18, .94, .25, .73, .7, .45, .56],
      [.12, .2, .48, .9, .96, .92, .08, .83, .68],
      [.47, .49, .78, .54, .58, .96, .45, .4, .77],
    ]);
    expect(NPC_PROFILES.map(p => p.id)).toEqual([...NPC_IDS]);
    expect(new Set(NPC_PROFILES.map(p => p.name)).size).toBe(9);
    expect(new Set(NPC_PROFILES.map(p => p.color)).size).toBe(9);
    expect(new Set(NPC_IDS.map(id => JSON.stringify(CAMP_PROFILES[id].traits))).size).toBe(9);
    for (const id of NPC_IDS) {
      const traits = CAMP_PROFILES[id].traits;
      expect(Object.keys(traits)).toHaveLength(9);
      expect(Object.values(traits).every(v => v >= 0 && v <= 1)).toBe(true);
      const projection = createNpc(id).personality;
      expect(Object.keys(projection)).toHaveLength(3);
      if (NPC_IDS.indexOf(id) >= 5) expect(projection).toEqual({ bravery: traits.courage, diligence: traits.diligence, empathy: traits.empathy });
    }
  });

  it('creates nine safe finite bodies and all directed social relationships', () => {
    const npcs = NPC_IDS.map(id => createNpc(id));
    expect(new Set(npcs.map(npc => JSON.stringify(npc.position))).size).toBe(9);
    for (const npc of npcs) {
      expect([npc.health, npc.energy, npc.hunger, npc.morale, npc.trust, npc.fear, npc.position.x, npc.position.y].every(Number.isFinite)).toBe(true);
      expect(worldCanTraverse(npc.position, npc.position, 52)).toBe(true);
    }
    const social = createSocialState(npcs);
    expect(Object.keys(social.people)).toHaveLength(9);
    expect(social.relationships).toHaveLength(72);
    expect(SOCIAL_LIMITS.agreements).toBe(9);
  });

  it('makes diligent Tiesheng work while self-interested Xiaoman evades the same demanding work', () => {
    const context = observe({ commandActionId: 'wood' });
    const steady = decide('tiesheng', context, work);
    const bargaining = decide('xiaoman', context, work);
    expect(steady.intent).toBe('cooperate');
    expect(steady.effort).toBeGreaterThan(.9);
    expect(bargaining.intent).toBe('evade');
    expect(bargaining.effort).toBeLessThan(.4);
    expect(bargaining.expression.allowDeception).toBe(true);
    expect(decide('xiaoman', context, work)).toEqual(bargaining);
  });

  it('makes Aling prioritize aid while Shenyan chooses a safe productive alternative', () => {
    const offers: ActionOffer[] = [
      { id: 'help', kind: 'aid', effort: .5, risk: .18, selfBenefit: 0, groupBenefit: 1, baseline: 0 },
      { id: 'food', kind: 'work', effort: .5, risk: 0, selfBenefit: 1, groupBenefit: 0, baseline: 0 },
    ];
    expect(decide('aling', observe(), offers).actionId).toBe('help');
    expect(decide('shenyan', observe(), offers).actionId).toBe('food');
  });

  it('makes Xiaoman avoid a risky route that Tiesheng accepts under the same benefits', () => {
    const offers: ActionOffer[] = [
      { id: 'risky-route', kind: 'explore', effort: 0, risk: .8, selfBenefit: 1, groupBenefit: 0, baseline: .08 },
      { id: 'safe-route', kind: 'explore', effort: 0, risk: 0, selfBenefit: 0, groupBenefit: 0, baseline: 0 },
    ];
    expect(decide('tiesheng', observe(), offers).actionId).toBe('risky-route');
    expect(decide('xiaoman', observe(), offers).actionId).toBe('safe-route');
  });

  it('lets patient Tiesheng endure denials that cause Linfeng to stop work', () => {
    const context = observe({ now: 4, commandActionId: 'wood', needs: { fatigue: .8, hunger: .2, pain: 0, exposure: 0 }, workload: .7, unfairness: .4 });
    function denied(id: NpcId) {
      const profile = CAMP_PROFILES[id], mind = createMind(profile, 0, 27);
      updateMind(mind, profile, { ...context, now: 0 });
      for (let sequence = 1; sequence <= 3; sequence++) receiveEvent(mind, profile, { sequence, at: sequence, type: 'request_denied', concern: 'rest', fact: 'rest denied' });
      return decideBehavior(mind, profile, context, work);
    }
    expect(denied('tiesheng').intent).toBe('endure');
    expect(['refuse', 'rest', 'recruit', 'strike']).toContain(denied('linlan').intent);
  });

  it('speaks distinct check-ins and refusal styles without mutating a world fact', () => {
    const ids: NpcId[] = ['tiesheng', 'aling', 'xiaoman', 'shenyan'];
    expect(new Set(ids.map(id => personalityCheckin(createNpc(id), 'fallback'))).size).toBe(4);
    const refusals = ids.map(id => {
      const npc = createNpc(id);
      npc.mind!.intent.kind = 'refuse'; npc.mind!.expression.kind = 'refusal';
      expect(campExpression(npc)).toBe(personalityExpression(npc));
      return personalityExpression(npc);
    });
    expect(new Set(refusals).size).toBe(4);
    const fact = '我听到了，但这个分工的问题还在。';
    for (const id of ids) expect(personalityAcknowledgement(createNpc(id), fact)).toContain(fact);
  });

  it('publishes distinct check-in and factual replies through real social conversations', () => {
    const ids: NpcId[] = ['tiesheng', 'aling', 'xiaoman', 'shenyan'];
    const prompts: string[] = [], replies: string[] = [];
    for (const id of ids) {
      const state = { ...createGame({ seed: 52 }), status: 'paused' as const };
      const opened = issueCommand(state, { type: 'social-open', npcId: id, topic: 'checkin' });
      const thread = opened.social.threads.at(-1)!;
      expect(thread.kind).toBe('checkin');
      prompts.push(thread.lines.at(-1)!.text);
      const replied = issueCommand(opened, { type: 'social-reply', threadId: thread.id, choiceId: 'listen' });
      const result = replied.social.threads.at(-1)!;
      replies.push(result.lines.at(-1)!.text);
      expect(result.status).toBe('resolved');
      expect(replied.npcs.find(npc => npc.id === id)!.action).toBeNull();
    }
    expect(new Set(prompts).size).toBe(4);
    expect(new Set(replies).size).toBe(4);
  });

  it('uses this-run custom traits for style, aid routing and behavior instead of the identity stereotype', () => {
    const state = { ...createGame({ seed: 52 }), status: 'paused' as const };
    const npc = state.npcs.find(npc => npc.id === 'xiaoman')!;
    const values = Object.fromEntries(Object.entries(CAMP_PROFILES.aling.traits).map(([key, value]) => [`trait.${key}`, value]));
    npc.initialSettings = { schemaVersion: 1, values: { ...CAMP_SETTINGS_CATALOG.characters.find(person => person.id === npc.id)!.defaults, ...values } };
    expect(getCampProfile(npc).traits).toEqual(CAMP_PROFILES.aling.traits);
    expect(personalityCheckin(npc, 'fallback')).toContain('谁受伤');
    state.npcs[0].injured = true; state.npcs[0].health = 50;
    const opened = issueCommand(state, { type: 'social-open', npcId: 'xiaoman', topic: 'checkin' });
    expect(opened.social.threads.at(-1)!.kind).toBe('help');
    const changed = decideBehavior(createMind(getCampProfile(npc), 0, 27), getCampProfile(npc), observe({ commandActionId: 'wood' }), work);
    expect(changed.intent).toBe('cooperate');
  });
});
