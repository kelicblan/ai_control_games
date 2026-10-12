import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, advanceGame, issueCommand } from '../src/game/engine';
import { baselinePolicy } from '../src/ai/policy';
import { applyDialogue, createDialogueTicket, DialogueDirector } from '../src/ai/dialogue';
import type { DialoguePayload, DialogueReply } from '../src/ai/dialogue';
import type { NpcId } from '../src/game/types';

import { minimindRuntime } from '../src/ai/minimind';
import { DialogueRequestError } from '../src/ai/minimind-protocol';
vi.mock('../src/ai/minimind', () => ({ minimindRuntime: {
  subscribe: vi.fn(() => () => {}), prepare: vi.fn(), generate: vi.fn(),
} }));
afterEach(() => vi.resetAllMocks());
// Reuse the existing outcome scenarios against an in-memory runtime adapter.
function mockRuntime(handler: (kind: string, init: RequestInit) => Promise<Response>) {
  vi.mocked(minimindRuntime.subscribe).mockImplementation(listener => {
    listener({ stage: 'ready', progress: 1 }); return () => {};
  });
  vi.mocked(minimindRuntime.prepare).mockImplementation(async () => {
    const response = await handler('local/health', {});
    if (!response.ok) throw new Error('WASM load failed');
  });
  vi.mocked(minimindRuntime.generate).mockImplementation(async (payload, signal) => {
    const response = await handler('local/speech', { body: JSON.stringify(payload), signal });
    if (!response.ok) throw new Error('WASM inference failed');
    const reply = await response.json();
    if (reply.source === 'template') throw new DialogueRequestError(0, reply.outcome);
    return reply;
  });
}

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
  it('rescans a still-open paused conversation when the background model becomes ready', async () => {
    const { state: initial } = socialWorld(); let state = initial; state.status = 'paused';
    let ready!: () => void; let loaded!: () => void;
    vi.mocked(minimindRuntime.subscribe).mockImplementation(listener => {
      listener({ stage: 'download', progress: 0 });
      ready = () => listener({ stage: 'ready', progress: 1 }); return () => {};
    });
    vi.mocked(minimindRuntime.prepare).mockImplementation(() => new Promise<void>(resolve => { loaded = resolve; }));
    vi.mocked(minimindRuntime.generate).mockImplementation(async payload => ({ requestId: payload.requestId,
      text: '我希望每个人都能轮流歇歇。', source: 'minimind3', latencyMs: 2 }));
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; } });
    director.setConversationThread(41); director.sync(state); const loading = director.probe();
    expect(minimindRuntime.generate).not.toHaveBeenCalled();
    ready(); loaded(); await loading; await new Promise(resolve => setTimeout(resolve, 10));
    expect(state.social.threads[0].lines.at(-1)?.source).toBe('minimind3');
    expect(minimindRuntime.generate).toHaveBeenCalledOnce(); director.dispose();
  });
  it.each(['health-first', 'speech-first'] as const)('keeps a runtime failure in fallback when %s resolves first', async order => {
    vi.useFakeTimers();
    let state = world(); const before = structuredClone(state);
    const pending = new Map<string, (response: Response) => void>();
    let speechRequests = 0;
    mockRuntime( (url: string) => new Promise<Response>(resolve => {
      const kind = url.endsWith('/health') ? 'health' : 'speech';
      if (kind === 'speech') speechRequests++;
      pending.set(kind, resolve);
    }));
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; } });
    try {
      const probe = director.probe(); director.sync(state);
      const fail = async (kind: string) => {
        pending.get(kind)!(new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));
        await vi.advanceTimersByTimeAsync(0);
      };
      await fail(order === 'health-first' ? 'health' : 'speech');
      await fail(order === 'health-first' ? 'speech' : 'health');
      await probe;
      expect(director.snapshot()).toMatchObject({ mode: 'fallback', generated: 0, failures: 1 });
      await vi.advanceTimersByTimeAsync(9000);
      expect(speechRequests).toBe(1);
      expect(state).toEqual(before);
    } finally { director.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it('requires explicit conversation authorization again after reset before processing a new paused chat', async () => {
    let state = createGame({ seed: 17 }); state.status = 'paused';
    state = issueCommand(state, { type: 'social-open', npcId: 'xiaomi', topic: 'food' });
    const threadId = state.social.threads.at(-1)!.id;
    const pending: { payload: DialoguePayload; resolve: (reply: DialogueReply) => void }[] = [];
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: payload => new Promise(resolve => pending.push({ payload, resolve })) });
    director.setConversationThread(threadId); director.sync(state); director.reset();
    state = issueCommand(state, { type: 'social-chat', threadId, text: '这次重新听听你的想法。' });
    director.sync(state);
    pending[0].resolve({ requestId: pending[0].payload.requestId, text: '这是重置前的过时回复。', source: 'minimind3', latencyMs: 1 });
    await Promise.resolve(); await Promise.resolve();
    expect(pending).toHaveLength(1);
    expect(state.social.threads.at(-1)!.lines.at(-1)?.source).toBe('template');
    director.setConversationThread(threadId); director.sync(state);
    pending[1].resolve({ requestId: pending[1].payload.requestId, text: '现在我想先听清楚大家的需要。', source: 'minimind3', latencyMs: 1 });
    await Promise.resolve(); await Promise.resolve();
    expect(state.social.threads.at(-1)!.lines.at(-1)?.source).toBe('minimind3');
    expect(state.elapsed).toBe(0); director.dispose();
  });

  it('retries a busy paused social message automatically without advancing simulation time', async () => {
    vi.useFakeTimers();
    const { state: initial } = socialWorld(); let state = initial; state.status = 'paused'; let attempts = 0;
    mockRuntime( async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string); attempts++;
      return new Response(JSON.stringify(attempts === 1 ? { requestId: payload.requestId, source: 'template', outcome: 'busy' }
        : { requestId: payload.requestId, source: 'minimind3', text: '我希望每个人都能轮流歇歇。', latencyMs: 1 }), { status: 200 });
    });
    const elapsed = state.elapsed;
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; } });
    try {
      director.setConversationThread(41); director.sync(state);
      await vi.advanceTimersByTimeAsync(3100);
      expect(state.social.threads[0].lines.at(-1)).toMatchObject({ source: 'minimind3', text: '我希望每个人都能轮流歇歇。' });
      expect(state.elapsed).toBe(elapsed); expect(attempts).toBe(2);
    } finally { director.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it('bounds repeated busy responses and never retries a rejected generation', async () => {
    vi.useFakeTimers(); let attempts = 0; let outcome = 'busy';
    const { state: initial } = socialWorld(); let state = initial; state.status = 'paused';
    mockRuntime( async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string); attempts++;
      return new Response(JSON.stringify({ requestId: payload.requestId, source: 'template', outcome }), { status: 200 });
    });
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; } });
    try {
      director.setConversationThread(41); director.sync(state);
      await vi.advanceTimersByTimeAsync(12000);
      expect(attempts).toBe(3);
      expect(state.social.threads[0].lines.at(-1)?.source).toBe('template');
      expect(director.snapshot()).toMatchObject({ mode: 'ready', generated: 0, failures: 0 });
      outcome = 'skipped'; director.reset(); director.setConversationThread(41); director.sync(state);
      await vi.advanceTimersByTimeAsync(12000);
      expect(attempts).toBe(4);
    } finally { director.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it.each(['close', 'reset', 'dispose'] as const)('cancels a busy social retry after %s', async action => {
    vi.useFakeTimers(); let attempts = 0;
    const { state: initial } = socialWorld(); let state = initial; state.status = 'paused';
    mockRuntime( async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string); attempts++;
      return new Response(JSON.stringify({ requestId: payload.requestId, source: 'template', outcome: 'busy' }), { status: 200 });
    });
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; } });
    try {
      director.setConversationThread(41); director.sync(state); await vi.advanceTimersByTimeAsync(0);
      if (action === 'close') director.setConversationThread(null); else director[action]();
      await vi.advanceTimersByTimeAsync(5000);
      expect(attempts).toBe(1); expect(state.social.threads[0].lines.at(-1)?.source).toBe('template');
    } finally { director.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it('replaces a busy retry with the latest real player message', async () => {
    vi.useFakeTimers(); let state = createGame({ seed: 17 }); state.status = 'paused';
    state = issueCommand(state, { type: 'social-open', npcId: 'xiaomi', topic: 'food' });
    const threadId = state.social.threads.at(-1)!.id; const requests: DialoguePayload[] = [];
    mockRuntime( async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string); requests.push(payload);
      return new Response(JSON.stringify(requests.length === 1 ? { requestId: payload.requestId, source: 'template', outcome: 'busy' }
        : { requestId: payload.requestId, source: 'minimind3', text: '我听到了新的想法，我们一起商量。', latencyMs: 1 }), { status: 200 });
    });
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; } });
    try {
      director.setConversationThread(threadId); director.sync(state); await vi.advanceTimersByTimeAsync(0);
      state = issueCommand(state, { type: 'social-chat', threadId, text: '我想先听听你的新意见。' }); director.sync(state);
      await vi.advanceTimersByTimeAsync(5000);
      expect(state.social.threads.at(-1)!.lines.at(-1)?.source).toBe('minimind3');
      expect(requests.at(-1)?.playerText).toBe('我想先听听你的新意见。'); expect(requests).toHaveLength(2);
    } finally { director.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it('processes a new paused chat queued during outage backoff without needing another game tick', async () => {
    vi.useFakeTimers(); let state = createGame({ seed: 17 }); state.status = 'paused';
    state = issueCommand(state, { type: 'social-open', npcId: 'xiaomi', topic: 'food' });
    const threadId = state.social.threads.at(-1)!.id; let attempts = 0;
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: async payload => {
        attempts++; if (attempts === 1) throw new Error('offline');
        return { requestId: payload.requestId, text: '服务恢复了，我也听到你的新想法。', source: 'minimind3', latencyMs: 1 };
      } });
    try {
      director.setConversationThread(threadId); director.sync(state); await vi.advanceTimersByTimeAsync(0);
      expect(director.snapshot().mode).toBe('fallback');
      state = issueCommand(state, { type: 'social-chat', threadId, text: '等你有空再谈谈食物安排。' }); director.sync(state);
      await vi.advanceTimersByTimeAsync(9000);
      expect(state.social.threads.at(-1)!.lines.at(-1)?.source).toBe('template');
      await vi.advanceTimersByTimeAsync(1500);
      expect(state.social.threads.at(-1)!.lines.at(-1)?.source).toBe('minimind3');
      expect(director.snapshot().mode).toBe('ready'); expect(state.elapsed).toBe(0); expect(attempts).toBe(2);
    } finally { director.dispose(); vi.useRealTimers(); }
  });

  it('replaces an in-flight paused response when two real chat messages share the same template caption', async () => {
    let state = createGame({ seed: 17 }); state.status = 'paused';
    state = issueCommand(state, { type: 'social-open', npcId: 'xiaomi', topic: 'food' });
    const threadId = state.social.threads.at(-1)!.id;
    const calls: { payload: DialoguePayload; signal: AbortSignal; resolve: (reply: DialogueReply) => void }[] = [];
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: (payload, signal) => new Promise(resolve => calls.push({ payload, signal, resolve })) });
    director.setConversationThread(threadId); director.sync(state);
    state = issueCommand(state, { type: 'social-chat', threadId, text: '先听听你怎么想。' });
    director.sync(state);
    const firstSpeech = state.npcs.find(npc => npc.id === 'xiaomi')!.speech;
    state = issueCommand(state, { type: 'social-chat', threadId, text: '我也希望每个人吃饱。' });
    expect(state.npcs.find(npc => npc.id === 'xiaomi')!.speech).toBe(firstSpeech);
    director.sync(state);
    expect(calls).toHaveLength(3);
    expect(calls[1].signal.aborted).toBe(true);
    expect(calls[2].payload.playerText).toBe('我也希望每个人吃饱。');
    calls[1].resolve({ requestId: calls[1].payload.requestId, text: '这是已经过时的回答。', source: 'minimind3', latencyMs: 1 });
    calls[2].resolve({ requestId: calls[2].payload.requestId, text: '一起考虑食物的分配，我会安心一些。', source: 'minimind3', latencyMs: 1 });
    await Promise.resolve(); await Promise.resolve();
    expect(state.social.threads.at(-1)!.lines.at(-1)).toMatchObject({ source: 'minimind3', text: '一起考虑食物的分配，我会安心一些。' });
    director.dispose();
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

  it('generates paused social speech only for the explicitly opened conversation', async () => {
    const { state: initial } = socialWorld(); let state = initial; state.status = 'paused';
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: async payload => ({ requestId: payload.requestId, text: '我想让大家轮流休息。', source: 'minimind3', latencyMs: 1 }) });
    director.sync(state); await new Promise(resolve => setTimeout(resolve, 10));
    expect(director.snapshot().generated).toBe(0);
    director.setConversationThread(41); director.sync(state);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(state.social.threads[0].lines[1].text).toBe('我想让大家轮流休息。');
    expect(director.snapshot().generated).toBe(1);
    director.sync(state); await new Promise(resolve => setTimeout(resolve, 10));
    expect(director.snapshot().generated).toBe(1);
    director.dispose();
  });

  it('cancels a pending paused conversation reply when its panel closes', async () => {
    const { state: initial } = socialWorld(); let state = initial; state.status = 'paused';
    let finish!: (reply: DialogueReply) => void, requestId = '';
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: payload => { requestId = payload.requestId; return new Promise(resolve => { finish = resolve; }); } });
    director.setConversationThread(41); director.sync(state); director.setConversationThread(null);
    finish({ requestId, text: '我想让大家轮流休息。', source: 'minimind3', latencyMs: 1 });
    await Promise.resolve(); await Promise.resolve();
    expect(state.social.threads[0].lines[1].source).toBe('template'); director.dispose();
  });

  it('prioritizes social foreground speech and accepts a follow-up during normal caption cooldown', async () => {
    const { state: initial, npc } = socialWorld(); let state = initial;
    state.selectedNpc = 'azhuang'; state.npcs[0].speech = '我先去采点木柴。'; state.npcs[0].speechUntil = 9;
    const requests: DialoguePayload[] = [];
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; }, now: () => 0,
      transport: async payload => {
        requests.push(payload);
        if (payload.npcId !== npc.id) return new Promise(() => {});
        return { requestId: payload.requestId, text: requests.length === 1 ? '我想让大家轮流休息。' : '你愿意听意见，我很高兴。', source: 'minimind3', latencyMs: 1 };
      } });
    director.sync(state); await new Promise(resolve => setTimeout(resolve, 10));
    expect(requests[0].npcId).toBe(npc.id);
    director.setConversationThread(41); state.status = 'paused';
    const nextNpc = state.npcs.find(n => n.id === npc.id)!;
    nextNpc.speech = '我听到了，还可以再商量。'; nextNpc.speechUntil++;
    state.social.threads[0].revision++;
    state.social.threads[0].lines.push({ id: 73, speaker: 'player', text: '我会认真听。', source: 'player', at: state.elapsed },
      { id: 74, speaker: npc.id, text: nextNpc.speech, source: 'template', at: state.elapsed });
    director.sync(state); await new Promise(resolve => setTimeout(resolve, 10));
    expect(state.social.threads[0].lines.at(-1)?.source).toBe('minimind3');
    expect(director.snapshot().generated).toBe(2); director.dispose();
  });

  it('retains generated social text when the same conversation is closed and reopened', async () => {
    const { state: initial } = socialWorld(); let state = initial; state.status = 'paused';
    const director = new DialogueDirector({ read: () => state, publish: next => { state = next; },
      transport: async payload => ({ requestId: payload.requestId,
        text: payload.recentLines.length ? '我们坐下慢慢商量吧。' : '我想让大家轮流休息。', source: 'minimind3', latencyMs: 1 }) });
    director.setConversationThread(41); director.sync(state);
    await new Promise(resolve => setTimeout(resolve, 10));
    director.setConversationThread(null); director.setConversationThread(41); director.sync(state);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(director.snapshot().generated).toBe(1);
    expect(state.social.threads[0].lines[1].text).toBe('我想让大家轮流休息。'); director.dispose();
  });

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
    mockRuntime( async (_url: string, init: RequestInit) => {
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
