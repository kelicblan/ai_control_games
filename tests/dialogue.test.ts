import { applyDialogue, createDialogueTicket } from '../src/games/camp/dialogue';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { buildFallbackSelection } from '../src/games/camp/dialogue/fallback-selection';
import { advanceGame,createGame,issueCommand } from '../src/games/camp/simulation/engine';
import type { NpcId } from '../src/games/camp/simulation/types';
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

function socialWorld(npcId: NpcId = 'linlan') {
  const state = world(), npc = state.npcs.find(n => n.id === npcId)!;
  state.npcs.forEach(n => { n.speech = ''; });
  npc.speech = '我希望分工能公平一些。'; npc.speechUntil = state.elapsed + 8;
  state.social.threads = [{ id: 41, kind: 'fairness', initiator: npcId, participants: [npcId, 'laozhou'],
    title: '商量轮换', prompt: '老周承担了很多工作，需要轮换。', createdAt: state.elapsed,
    expiresAt: state.elapsed + 30, status: 'open', revision: 1, choiceId: null, resolution: '',
    lines: [{ id: 71, speaker: 'player', text: '我们怎么轮换比较公平？', at: state.elapsed, source: 'player' },
      { id: 72, speaker: npcId, text: npc.speech, at: state.elapsed, source: 'template' }] }];
  return { state, npc };
}

function world() {
  let state = createGame({ seed: 17 });
  state.status = 'playing';
  state = advanceGame(state, .1, baselinePolicy);
  return state;
}

describe('nonblocking NPC dialogue', () => {
  it('revalidates a real MiniMind candidate after movement while preserving intent and command guards', () => {
    const state = world(), npc = state.npcs[0], ticket = createDialogueTicket(state, npc);
    const text = buildFallbackSelection(ticket.payload)!.choices[0];
    npc.position = { x: -500, y: -500 }; state.weather = state.weather === 'storm' ? 'clear' : 'storm';
    expect(applyDialogue(state, ticket, text, 'minimind3').npcs[0].speechOrigin?.source).toBe('minimind3');
    expect(applyDialogue(state, ticket, text, 'remote:test')).toBe(state);
    npc.command = 'rest';
    expect(applyDialogue(state, ticket, text, 'minimind3')).toBe(state);
    npc.command = null; npc.mind!.intent.kind = 'refuse';
    expect(applyDialogue(state, ticket, text, 'minimind3')).toBe(state);
  });
  it('grounds each of five personas in only their known memories and current player exchange', () => {
    for (const npcId of ['azhuang', 'xiaomi', 'laozhou', 'linlan', 'aye'] as const) {
      const { state, npc } = socialWorld(npcId);
      state.social.memories = [{ id: 1, npcId, threadId: 40, at: 0, kind: 'choice', text: '队长安排过轮换任务。' },
        { id: 2, npcId: npcId === 'xiaomi' ? 'aye' : 'xiaomi', threadId: 39, at: 0, kind: 'choice', text: '只有另一个伙伴知道的秘密。' }];
      const ticket = createDialogueTicket(state, npc);
      expect(ticket.payload.memories).toContain('队长安排过轮换任务。');
      expect(ticket.payload.memories).not.toContain('只有另一个伙伴知道的秘密。');
      expect(ticket.payload.playerText).toBe('我们怎么轮换比较公平？');
      expect(ticket.payload.socialContext?.join('')).toContain('老周');
      expect(ticket.payload.persona).not.toBe(npc.role);
      expect(ticket.threadId).toBe(41); expect(ticket.lineId).toBe(72);
    }
  });

  it('updates the matching transcript caption without creating effects or a new semantic revision', () => {
    const { state, npc } = socialWorld();
    const ticket = createDialogueTicket(state, npc), original = structuredClone(state);
    const next = applyDialogue(state, ticket, '我想让每个人都能歇口气。');
    expect(next.social.threads[0].lines[1]).toMatchObject({ text: '我想让每个人都能歇口气。', source: 'minimind3' });
    expect(next.social.revision).toBe(state.social.revision);
    expect(next.social.threads[0].revision).toBe(1);
    expect(next.social.promises).toEqual(original.social.promises);
    expect(next.social.agreements).toEqual(original.social.agreements);
    expect(next.decisions).toEqual(original.decisions);
    expect([next.food, next.wood, npc.action]).toEqual([original.food, original.wood, original.npcs.find(n => n.id === npc.id)!.action]);
  });

  it('rejects a social reply after choice or replacement of its exact transcript line', () => {
    const { state, npc } = socialWorld(), ticket = createDialogueTicket(state, npc);
    for (const alter of [
      (next: typeof state) => { next.social.threads[0].revision++; next.social.threads[0].choiceId = 'rotate'; },
      (next: typeof state) => { next.social.threads[0].lines[1].id++; },
      (next: typeof state) => { next.social.threads[0].lines[1].text = '新的真实反馈。'; },
    ]) {
      const next = structuredClone(state); alter(next);
      expect(applyDialogue(next, ticket, '我们可以商量好再行动。')).toBe(next);
    }
  });

  it('rejects replies after a new command, weather change, injury, pause or death', () => {
    const state = world();
    const ticket = createDialogueTicket(state, state.npcs[0]);
    for (const alter of [
      (next: typeof state) => { next.status = 'paused'; },
      (next: typeof state) => { next.weather = 'storm'; },
      (next: typeof state) => { next.npcs[0].alive = false; },
      (next: typeof state) => { next.npcs[0].speech = '啊，烫到了！'; },
      (next: typeof state) => { next.npcs[0].action = next.npcs[0].action === 'rest' ? 'wood' : 'rest'; },
    ]) {
      const next = structuredClone(state); alter(next);
      expect(applyDialogue(next, ticket, '我先把这件事做好。')).toBe(next);
    }
  });

  it('never lets generated speech override the immediate injury reaction', () => {
    let state = world();
    state.npcs[0].collision = { reactionUntil: 2, hurtUntil: 1, objectCooldowns: {} };
    const ticket = createDialogueTicket(state, state.npcs[0]);
    expect(applyDialogue(state, ticket, '我去采木头。')).toBe(state);
  });

  it('rejects a valid first sentence followed by fabricated completion or reversed refusal', () => {
    const state = world(); const npc = state.npcs[0];
    const ticket = createDialogueTicket(state, npc);
    expect(applyDialogue(state, ticket, '我先歇口气。木材已经全部入库了。')).toBe(state);
    npc.mind!.intent.kind = 'refuse'; npc.mind!.expression.kind = 'refusal'; npc.mind!.expression.tone = 'angry';
    const refusal = createDialogueTicket(state, npc);
    expect(applyDialogue(state, refusal, '别催了，我就要歇着！我马上继续干活。')).toBe(state);
  });

  it('rejects a response when persistent intention changes without changing the old caption', () => {
    const state = world(); const npc = state.npcs[0];
    npc.action = 'rest'; delete npc.wildTask; // Isolate mind-only invalidation from a survival execution override.
    const ticket = createDialogueTicket(state, npc);
    npc.mind!.intent.kind = 'refuse';
    npc.mind!.expression.kind = 'refusal'; npc.mind!.expression.tone = 'angry';
    npc.mind!.expression.revision++; npc.mind!.revision++;
    expect(applyDialogue(state, ticket, '我马上继续干活。')).toBe(state);
    const current = createDialogueTicket(state, npc);
    expect(current.payload.privateIntent).toContain('refuse');
    expect(current.payload.publicExpression).toMatchObject({ kind: 'refusal', tone: 'angry' });
    expect(applyDialogue(state, current, '我马上继续干活。')).toBe(state);
  });

  it('keeps unresolved denial counts in authoritative prompt facts even after old memories are gone', () => {
    const { state, npc } = socialWorld();
    npc.mind!.memories = [];
    npc.mind!.concerns = [{ id: 1, kind: 'rest', status: 'open', openedAt: 0,
      updatedAt: state.elapsed, resolvedAt: null, denials: 4, severity: .9 }];
    const payload = createDialogueTicket(state, npc).payload;
    expect(payload.facts.slice(0, 8).join('；')).toContain('休息诉求未解决，已被拒绝4次');
  });

  it('provides recent player and NPC turns separately from repetition prevention', () => {
    const { state, npc } = socialWorld();
    const payload = createDialogueTicket(state, npc).payload;
    expect(payload.conversation).toEqual([
      { speaker: '玩家', text: '我们怎么轮换比较公平？' },
      { speaker: npc.name, text: npc.speech },
    ]);
    expect(payload.recentLines).toEqual([]);
  });

  it('rejects malformed, duplicate and thinking output', () => {
    const state = world();
    const ticket = createDialogueTicket(state, state.npcs[0]);
    for (const text of ['', '<think>隐含推理</think>', 'a'.repeat(300), state.npcs[0].speech]) {
      expect(applyDialogue(state, ticket, text)).toBe(state);
    }
    const commanded = issueCommand(state, { type: 'praise', npcId: state.npcs[0].id });
    expect(applyDialogue(commanded, ticket, '我先把这件事做好。')).toBe(commanded);
  });
});
