import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogueDirector } from '../packages/npc-dialogue/src/director';
import type { DialogueCandidate, DialoguePayload, DialogueReply } from '../packages/npc-dialogue/src/types';

const payload: DialoguePayload = { requestId: '', npcId: 'waiter', name: '服务员', persona: '直率',
  action: 'serve', emotion: 'angry', event: '我要先歇一下。', facts: ['还有三桌客人'], memories: [], recentLines: [] };
const makeCandidate = (revision: string): DialogueCandidate<string> => ({ actorId: 'waiter', revision,
  key: revision, ticket: revision, payload, priority: 1, eligible: true, urgent: true, allowRefill: false });
const clock = { now: () => 0, schedule: (_fn: () => void, _ms: number) => () => {},
  cancellation: () => { const controller = new AbortController(); return { signal: controller.signal, cancel: () => controller.abort() }; } };

afterEach(() => vi.useRealTimers());

describe('可独立复用的对话调度', () => {
  it.each(['minimind3', 'native:gamesoul', 'remote:custom'])('keeps %s provenance when consuming cached speech', async source => {
    vi.useFakeTimers(); let revision = 'first', count = 0;
    const commit = vi.fn((_ticket: string, _text: string, _source: string) => 'published');
    const director = new DialogueDirector({ clock, bridge: {
      canRun: () => true, collect: () => [{ ...makeCandidate(revision), key: 'same-context', allowRefill: true }],
      isCurrent: () => true, commit,
    }, validate: () => true, transport: async request => ({ requestId: request.requestId,
      text: `reply-${++count}`, source, latencyMs: 1 }) });
    try {
      director.sync(); await vi.advanceTimersByTimeAsync(0);
      expect(director.snapshot().poolSize).toBe(1);
      revision = 'second'; director.sync();
      expect(commit.mock.calls.at(-1)?.[2]).toBe(source);
      expect(director.snapshot()).toMatchObject({ generated: 1, cached: 1 });
      expect(director.snapshot().lines.waiter.source).toBe(source);
    } finally { director.dispose(); }
  });
  it('allows a host deadline that leaves time for preferred timeout plus fallback', async () => {
    vi.useFakeTimers(); let finish!: (reply: DialogueReply) => void; let request!: DialoguePayload;
    const commit = vi.fn(() => 'done');
    const director = new DialogueDirector({ requestTimeoutMs: 20000, clock: { ...clock,
      schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } },
      bridge: { canRun: () => true, collect: () => [makeCandidate('r')], isCurrent: () => true, commit },
      transport: p => { request = p; return new Promise(r => { finish = r; }); }, validate: () => true });
    director.sync(); await vi.advanceTimersByTimeAsync(12000);
    finish({ requestId: request.requestId, source: 'fallback', text: '内置模型的回复。', latencyMs: 12000 });
    await vi.advanceTimersByTimeAsync(0); expect(commit).toHaveBeenCalledOnce(); director.dispose();
  });
  it('clears runtime statistics and old replies when resetting the world', async () => {
    let revision = 'first'; const published: string[] = [];
    const requests: { payload: DialoguePayload; finish: (reply: DialogueReply) => void }[] = [];
    const director = new DialogueDirector({ clock, bridge: {
      canRun: () => true, collect: () => [makeCandidate(revision)], isCurrent: () => true,
      commit: (_ticket, text) => { published.push(text); return revision + ':done'; },
    }, transport: request => new Promise(finish => requests.push({ payload: request, finish })), validate: () => true });
    try {
      director.sync();
      requests[0].finish({ requestId: requests[0].payload.requestId, text: 'old reply', source: 'test', latencyMs: 25 });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(director.snapshot().generated).toBe(1);
      revision = 'pending'; director.sync();
      director.reset(true);
      expect(director.snapshot()).toMatchObject({ generated: 0, cached: 0, discarded: 0, failures: 0, latencyMs: 0, poolSize: 0, lines: {} });
      requests[1].finish({ requestId: requests[1].payload.requestId, text: 'stale reply', source: 'test', latencyMs: 12 });
      await Promise.resolve(); await Promise.resolve();
      expect(published).toEqual(['old reply']);
      revision = 'new'; director.sync();
      expect(requests[2].payload.recentLines).toEqual([]);
    } finally { director.dispose(); }
  });
  it('超时后释放不响应取消的任务，旧回复不能提交或清掉下一名NPC的任务', async () => {
    vi.useFakeTimers();
    const published: string[] = [];
    const actors = ['waiter', 'cook', 'cashier'];
    const pending: { payload: DialoguePayload; finish: (reply: DialogueReply) => void }[] = [];
    const director = new DialogueDirector({ clock: { ...clock, now: () => Date.now(),
      schedule: (callback, milliseconds) => { const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer); } },
      bridge: {
        canRun: () => true,
        collect: () => actors.map((actorId, index) => ({ ...makeCandidate(actorId), actorId,
          priority: 3 - index, payload: { ...payload, npcId: actorId } })),
        isCurrent: () => true,
        commit: (ticket, text) => { published.push(text); return ticket + ':published'; },
      },
      // 第一个 promise 不监听取消；模拟不可控的网络/推理适配器。
      transport: request => new Promise(finish => pending.push({ payload: request, finish })), validate: () => true });
    try {
      director.sync(); expect(pending.map(item => item.payload.npcId)).toEqual(['waiter']);
      await vi.advanceTimersByTimeAsync(8001);
      expect(pending.map(item => item.payload.npcId)).toEqual(['waiter', 'cook']);
      expect(director.snapshot().failures).toBe(1);
      pending[0].finish({ requestId: pending[0].payload.requestId, text: '过期回答。', source: 'test', latencyMs: 9000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(published).toEqual([]);
      // 旧任务的 finally 不能释放正在运行的 cook 并提前启动 cashier。
      expect(pending).toHaveLength(2);
      pending[1].finish({ requestId: pending[1].payload.requestId, text: '厨师现在回答。', source: 'test', latencyMs: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(published).toEqual(['厨师现在回答。']);
      expect(pending.map(item => item.payload.npcId)).toEqual(['waiter', 'cook', 'cashier']);
    } finally { director.dispose(); }
  });
  it('显式移除人物清理版本、冷却、近期字幕、缓存和公开状态，ID再使用不继承旧会话', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const candidate = { ...makeCandidate('same-revision'), urgent: false, allowRefill: true };
    const director = new DialogueDirector({ clock, bridge: {
      canRun: () => true, collect: () => [candidate], isCurrent: () => true,
      commit: () => 'published',
    }, validate: () => true, transport: async request => {
      calls++; return { requestId: request.requestId, source: 'test', latencyMs: 1,
        text: calls % 2 === 1 ? '这名员工的回答。' : '提前生成的缓存回答。' };
    } });
    try {
      director.sync(); await vi.advanceTimersByTimeAsync(0);
      expect(director.snapshot()).toMatchObject({ generated: 1, poolSize: 1 });
      director.forgetActor('waiter');
      expect(director.snapshot()).toMatchObject({ poolSize: 0, lines: {} });
      director.sync(); await vi.advanceTimersByTimeAsync(0);
      expect(director.snapshot()).toMatchObject({ generated: 2, cached: 0 });
      expect(calls).toBe(4);
    } finally { director.dispose(); }
  });

  it('移除人物取消其在途任务与排队任务，不阻塞其余人物', async () => {
    vi.useFakeTimers();
    const published: string[] = [];
    const pending: { payload: DialoguePayload; signal: { readonly aborted: boolean }; finish: (reply: DialogueReply) => void }[] = [];
    const director = new DialogueDirector({ clock, bridge: {
      canRun: () => true, collect: () => ['waiter', 'cook', 'cashier'].map((actorId, index) => ({
        ...makeCandidate(actorId), actorId, priority: 3 - index, payload: { ...payload, npcId: actorId },
      })), isCurrent: () => true,
      commit: (ticket, text) => { published.push(text); return ticket + ':published'; },
    }, validate: () => true, transport: (request, signal) => new Promise(finish => pending.push({ payload: request, signal, finish })) });
    try {
      director.sync(); director.forgetActor('waiter'); director.forgetActor('cashier');
      expect(pending.map(item => item.payload.npcId)).toEqual(['waiter', 'cook']);
      expect(pending[0].signal.aborted).toBe(true);
      pending[0].finish({ requestId: pending[0].payload.requestId, text: '已离开的员工回答。', source: 'test', latencyMs: 1 });
      pending[1].finish({ requestId: pending[1].payload.requestId, text: '厨师继续回答。', source: 'test', latencyMs: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(published).toEqual(['厨师继续回答。']); expect(pending).toHaveLength(2);
      expect(director.snapshot().lines.waiter).toBeUndefined();
    } finally { director.dispose(); }
  });

  it('拒绝旧意图与旧世界的异步结果，不需要任何营地类型', async () => {
    let revision = 'serve'; let published = '';
    const pending: { payload: DialoguePayload; finish: (r: DialogueReply) => void }[] = [];
    const director = new DialogueDirector({ clock, bridge: {
      canRun: () => true, collect: () => [makeCandidate(revision)],
      isCurrent: ticket => ticket === revision,
      commit: (ticket, text) => { if (ticket !== revision) return false; published = text; return revision + ':published'; },
    }, transport: request => new Promise(finish => pending.push({ payload: request, finish })), validate: () => true });
    director.sync(); revision = 'refuse'; director.sync();
    pending[0].finish({ requestId: pending[0].payload.requestId, text: '我现在继续端菜。', source: 'test', latencyMs: 1 });
    await Promise.resolve(); await Promise.resolve(); expect(published).toBe('');
    director.reset(); revision = 'serve'; director.sync();
    pending[1].finish({ requestId: pending[1].payload.requestId, text: '这是旧世界的回答。', source: 'test', latencyMs: 1 });
    await Promise.resolve(); await Promise.resolve(); expect(published).toBe('');
    pending[2].finish({ requestId: pending[2].payload.requestId, text: '这是新世界的回答。', source: 'test', latencyMs: 1 });
    await Promise.resolve(); await Promise.resolve(); expect(published).toBe('这是新世界的回答。'); director.dispose();
  });
});
