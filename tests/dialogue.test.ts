import { describe, expect, it, vi } from 'vitest';
import { createGame, advanceGame, issueCommand } from '../src/game/engine';
import { baselinePolicy } from '../src/ai/policy';
import { applyDialogue, createDialogueTicket, DialogueDirector } from '../src/ai/dialogue';
import type { DialoguePayload, DialogueReply } from '../src/ai/dialogue';

function world() {
  let state = createGame({ seed: 17 });
  state.status = 'playing';
  state = advanceGame(state, .1, baselinePolicy);
  return state;
}

describe('nonblocking NPC dialogue', () => {
  it('keeps the MLP simulation moving while language generation is pending', () => {
    let state = world();
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: () => new Promise(() => {}), now: () => 0 });
    director.sync(state);
    state = advanceGame(state, .1, baselinePolicy);
    expect(state.elapsed).toBeCloseTo(.2);
    expect(state.npcs.some(n => n.action !== null)).toBe(true);
    director.dispose();
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

  it('cannot leak a reply into a restarted journey with the same seed and timestamps', async () => {
    let state = world();
    let finish!: (reply: DialogueReply) => void;
    let requestId = '';
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: payload => { requestId = payload.requestId; return new Promise(resolve => { finish = resolve; }); } });
    director.sync(state);
    director.reset();
    state = world();
    finish({ requestId, text: '这句属于上一局。', source: 'minimind3', latencyMs: 100 });
    await Promise.resolve(); await Promise.resolve();
    expect(state.npcs.every(n => n.speech !== '这句属于上一局。')).toBe(true);
    director.dispose();
  });

  it('publishes a matching reply without changing decisions or triggering its own foreground request', async () => {
    let state = world();
    state.npcs.slice(1).forEach(n => { n.speech = ''; });
    const decisions = structuredClone(state.decisions);
    const transport = vi.fn(async (payload: DialoguePayload) => ({ requestId: payload.requestId,
      text: '我先把这件事做好。', source: 'minimind3' as const, latencyMs: 80 }));
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; }, transport });
    director.sync(state);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(state.npcs[0].speech).toBe('我先把这件事做好。');
    expect(state.decisions).toEqual(decisions);
    const generated = director.snapshot().generated;
    director.sync(state);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(director.snapshot().generated).toBe(generated);
    // At most one foreground generation and one low-priority pool refill.
    expect(transport.mock.calls.length).toBeLessThanOrEqual(2);
    director.dispose();
  });

  it('retains immediate feedback when service fails and limits retries', async () => {
    let state = world();
    const original = state.npcs.map(n => n.speech);
    const transport = vi.fn(async () => { throw new Error('offline'); });
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; }, transport, now: () => 0 });
    director.sync(state);
    await new Promise(resolve => setTimeout(resolve, 10));
    director.sync(state);
    expect(state.npcs.map(n => n.speech)).toEqual(original);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(director.snapshot().mode).toBe('fallback');
    director.dispose();
  });

  it('treats a normal skipped caption as connected and keeps immediate feedback', async () => {
    let state = world(); state.npcs.slice(1).forEach(n => { n.speech = ''; });
    const original = state.npcs[0].speech;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ requestId: payload.requestId, source: 'template', outcome: 'skipped' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; } });
    try {
      director.sync(state);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(director.snapshot().mode).toBe('ready');
      expect(director.snapshot().generated).toBe(0);
      expect(director.snapshot().discarded).toBe(1);
      expect(state.npcs[0].speech).toBe(original);
    } finally { director.dispose(); vi.unstubAllGlobals(); }
  });

  it('consumes a pre-generated matching line immediately and rejects it in different weather', async () => {
    let state = world(); state.npcs.slice(1).forEach(n => { n.speech = ''; });
    const original = state.npcs[0].speech;
    const texts = ['我先把这件事做好。', '这件事交给我来办吧。', '我会仔细做好这件事。'];
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: async payload => ({ requestId: payload.requestId, text: texts.shift() ?? '我来认真办好这件事。',
        source: 'minimind3', latencyMs: 50 }) });
    director.sync(state);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(director.snapshot().poolSize).toBe(1);
    state.npcs[0] = { ...state.npcs[0], speech: original, speechUntil: state.elapsed + 6 };
    director.sync(state);
    expect(state.npcs[0].speech).toBe('这件事交给我来办吧。');
    expect(director.snapshot().cached).toBe(1);
    state.weather = 'storm';
    state.npcs[0] = { ...state.npcs[0], speech: original, speechUntil: state.elapsed + 7 };
    director.sync(state);
    expect(state.npcs[0].speech).toBe(original);
    director.dispose();
  });

  it('never lets generated speech override the immediate injury reaction', () => {
    let state = world();
    state.npcs[0].collision = { reactionUntil: 2, hurtUntil: 1, objectCooldowns: {} };
    const ticket = createDialogueTicket(state, state.npcs[0]);
    expect(applyDialogue(state, ticket, '我去采木头。')).toBe(state);
  });

  it('expires unused pool entries instead of replaying old prepared captions', async () => {
    let state = world(); state.npcs.slice(1).forEach(n => { n.speech = ''; });
    const original = state.npcs[0].speech;
    let now = 0, calls = 0;
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; }, now: () => now,
      transport: payload => {
        calls++;
        if (calls > 2) return new Promise(() => {});
        return Promise.resolve({ requestId: payload.requestId,
          text: calls === 1 ? '我先把这件事做好。' : '这件事交给我来办吧。', source: 'minimind3', latencyMs: 50 });
      } });
    director.sync(state);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(director.snapshot().poolSize).toBe(1);
    now = 31000;
    state.npcs[0] = { ...state.npcs[0], speech: original, speechUntil: state.elapsed + 8 };
    director.sync(state);
    expect(director.snapshot().cached).toBe(0);
    expect(state.npcs[0].speech).toBe(original);
    director.dispose();
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
