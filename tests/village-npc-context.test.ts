import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { LOCATIONS, isAtCamp } from '../src/games/camp/simulation/constants';
import { foodReserve } from '../src/games/camp/simulation/survival';
import { getTaskDestination } from '../src/games/camp/simulation/terrain';
import { VILLAGE_FACILITIES } from '../src/games/camp/world/villageLayout';
import { worldCanTraverse } from '../src/games/camp/world/navigation';
import { createDialogueTicket, fingerprint } from '../src/games/camp/dialogue/context';
import { buildCaptionPrompt, cleanCaption, CAMP_PROMPT_BUDGET } from '../src/games/camp/dialogue/language';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { getSocialChoices } from '../src/games/camp/simulation/social';

describe('NPCs belong to the current village', () => {
  it('uses the actual warehouse for supplies and all nine separated meal/delivery stations', () => {
    const warehouse = VILLAGE_FACILITIES.find(f => f.id === 'warehouse')!;
    expect(LOCATIONS.storage).toEqual(warehouse.center);
    const state = createGame({ seed: 17 });
    const points = state.npcs.map(n => getTaskDestination('eat', n.id));
    expect(new Set(points.map(p => `${p.x}:${p.y}`)).size).toBe(9);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      expect(Math.abs(p.x - warehouse.center.x)).toBeLessThan(warehouse.half.x);
      expect(Math.abs(p.y - warehouse.center.y)).toBeLessThan(warehouse.half.y);
      expect(worldCanTraverse(p, p, 17)).toBe(true);
      expect(getTaskDestination('camp', state.npcs[i].id, true)).toEqual(p);
    }
  });

  it('does not deposit cargo at the removed supply station', () => {
    const state = createGame({ seed: 17 }); state.status = 'playing'; state.food = 50;
    const n = state.npcs[0]; n.position = { x: 29, y: 72 }; n.destination = { ...n.position };
    n.action = 'food'; n.actionDuration = .01; n.progress = .99; n.inventory.food = 4;
    const next = advanceGame(state, .25, baselinePolicy);
    expect(next.stats.gatheredFood).toBe(0);
    expect(next.npcs[0].inventory.food).toBe(4);
  });

  it('grounds prompts in the village and rejects tents and unimplemented manufacturing', () => {
    const state = createGame({ seed: 17 });
    const npc = state.npcs[0]; npc.action = 'rest'; npc.speech = '我先回民居避雨。';
    const payload = createDialogueTicket(state, npc).payload;
    const prompt = buildCaptionPrompt(payload);
    expect(prompt).toContain('村寨');
    expect(prompt).toContain('仓库');
    expect(prompt.length).toBeLessThanOrEqual(CAMP_PROMPT_BUDGET);
    expect(cleanCaption('我先去帐篷檐下躲雨。', payload)).toBe('');
    expect(cleanCaption('我去兵器铺打造一把长剑。', payload)).toBe('');
    expect(cleanCaption('我回自己屋里避一避雨。', payload)).not.toBe('');
  });

  it('does not let old history teach the language model nonexistent tents', () => {
    const state = createGame({ seed: 17 }); const npc = state.npcs[0]; npc.action = 'rest';
    npc.speech = '我去帐篷下避雨。';
    const payload = createDialogueTicket(state, npc).payload;
    payload.memories = ['昨晚拉紧了帐篷绳。'];
    const prompt = buildCaptionPrompt(payload);
    expect(prompt).not.toContain('帐篷下避雨');
    expect(prompt).not.toContain('拉紧了帐篷绳');
  });

  it('invalidates generated dialogue when the gate or food-reserve status changes', () => {
    const state = createGame({ seed: 17 }); state.food = 0; const npc = state.npcs[0];
    const before = fingerprint(state, npc);
    state.world!.gateOpen = false;
    expect(fingerprint(state, npc)).not.toBe(before);
    const closed = fingerprint(state, npc); state.food = 90;
    expect(fingerprint(state, npc)).not.toBe(closed);
  });

  it('expresses the executed survival task while retaining the underlying protest', () => {
    const state = createGame({ seed: 17 }); state.status = 'playing'; state.food = 0;
    const npc = state.npcs[3];
    npc.mind!.intent = { ...npc.mind!.intent, kind: 'strike', actionId: 'rest', until: 100 };
    npc.mind!.expression.kind = 'refusal'; npc.mind!.expression.tone = 'angry';
    const next = advanceGame(state, .1, baselinePolicy); const person = next.npcs[3];
    expect(person.action).toBe('food');
    expect(person.mind!.intent.kind).toBe('strike');
    expect(person.speech).toMatch(/粮|食物|口粮/);
    expect(createDialogueTicket(next, person).payload.publicExpression?.kind).toBe('explanation');
  });

  it('offers real homes rather than tents in social care choices', () => {
    let state = createGame({ seed: 17 }); state.status = 'paused'; state.npcs[0].energy = 15;
    state = issueCommand(state, { type: 'social-open', npcId: 'azhuang', topic: 'checkin' });
    const thread = state.social.threads.at(-1)!;
    const choices = JSON.stringify(getSocialChoices(state, thread));
    expect(choices).not.toContain('帐篷');
    expect(choices).toMatch(/民居|屋/);
  });

  it('keeps survival execution truthful after urging and rejected movement', () => {
    let state = createGame({ seed: 17 }); state.status = 'playing'; state.food = 0;
    const n = state.npcs[3]; n.mind!.intent = { ...n.mind!.intent, kind: 'strike', actionId: 'rest', until: 100 };
    state = advanceGame(state, .1, baselinePolicy);
    state = issueCommand(state, { type: 'urge', npcId: n.id });
    expect(state.npcs[3].action).toBe('food');
    expect(state.npcs[3].speech).toMatch(/口粮|食物/);
    state = issueCommand(state, { type: 'move', npcId: n.id, target: { x: 50, y: 110 } });
    expect(state.npcs[3].speech).toMatch(/口粮|食物/);
  });

  it('rejects ordinary closed-gate and unsupported-task claims but accepts waiting for the gate', () => {
    const state = createGame({ seed: 17 }); state.world!.gateOpen = false;
    const payload = createDialogueTicket(state, state.npcs[0]).payload;
    expect(cleanCaption('我去寨外采点食物。', payload)).toBe('');
    expect(cleanCaption('我到兵器铺打把刀。', payload)).toBe('');
    expect(cleanCaption('我去练武场练功。', payload)).toBe('');
    expect(cleanCaption('等开门再出去采集。', payload)).toBe('等开门再出去采集。');
  });

  it('keeps physical survival speech after diagnostic decision history is pruned', () => {
    let state = createGame({ seed: 17 }); state.status = 'playing'; state.food = 0;
    state.npcs[3].mind!.intent = { ...state.npcs[3].mind!.intent, kind: 'strike', actionId: 'rest', until: 100 };
    state = advanceGame(state, .1, baselinePolicy); state.decisions = [];
    state = issueCommand(state, { type: 'urge', npcId: 'linlan' });
    expect(state.npcs[3].speech).toMatch(/口粮|食物/);
  });

  it('starts a new populated village with enough real stock for the first supply round trip', () => {
    for (const difficulty of ['normal', 'hard'] as const) {
      const state = createGame({ seed: 17, difficulty });
      expect(state.food).toBeGreaterThanOrEqual(foodReserve(state).minimum);
      expect(state.stats.gatheredFood).toBe(0);
    }
  });

  it('recognizes the actual walled village and plaza as safe without a fire-radius dependency', () => {
    const state = createGame({ seed: 17 }); const n = state.npcs[0];
    n.position = { ...LOCATIONS.camp };
    expect(isAtCamp(n)).toBe(true);
    n.position = { x: 50, y: 350 };
    expect(isAtCamp(n)).toBe(false);
  });
});
