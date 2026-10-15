import { afterEach, expect, it, vi } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { DialogueSession, generateDialogue } from '../src/games/camp/dialogue/session';
import type { DialoguePayload, DialogueReply } from '../packages/npc-dialogue/src/types';
import { retainDialogueRecords, type DialogueRecord } from '../src/games/camp/dialogue/records';
import { WorldMessageStore } from '../src/gameMessages';
import { modelManager } from '../src/integrations/models/runtime';
vi.mock('../src/integrations/models/runtime', () => ({ modelManager: { generate: vi.fn() }, modelName: vi.fn(), prepareModels: vi.fn() }));
const sessions: DialogueSession[] = [];
afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); vi.useRealTimers(); vi.clearAllMocks(); });
function setup() {
  const game = createGame({ seed: 17 }); game.status = 'playing'; game.events = [];
  game.npcs.forEach(n => { n.speech = ''; });
  game.npcs[0].speech = '我想听听大家的看法。'; game.npcs[0].speechUntil = 6;
  let scope = 'world:one'; const records: DialogueRecord[] = [];
  const pending: { payload: DialoguePayload; signal: AbortSignal; finish(value: DialogueReply): void }[] = [];
  const persist = vi.fn(async (_scope: string, record: DialogueRecord) => { records.push(record); return record; });
  const spoken = vi.fn(), waiting = vi.fn();
  const session = new DialogueSession({ read: () => game, scope: () => scope, records: () => records,
    persist, onSpoken: spoken, onPending: waiting,
    transport: (payload, signal) => new Promise(resolve => pending.push({ payload, signal, finish: resolve })) });
  sessions.push(session);
  return { game, records, pending, persist, spoken, waiting, session, changeWorld: () => { scope = 'world:two'; } };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const reply = (request: ReturnType<typeof setup>['pending'][number]) => request.finish({ requestId: request.payload.requestId, text: '咱们先把事情说清楚吧。', source: 'minimind3', latencyMs: 12000 });
it('waits for the addressed NPC to publish before generating a dependent answer and excludes unspoken placeholders',async()=>{
  const f=setup(),from=f.game.npcs[0],to=f.game.npcs[1];
  from.speech='你愿意一起谈谈分工吗？';to.speech='我先不加入，先把话说清楚。';
  f.game.social.threads=[{id:42,kind:'fairness',initiator:from.id,participants:[from.id,to.id],title:'共同诉求与交涉',prompt:'商量分工',createdAt:0,expiresAt:60,status:'open',revision:1,choiceId:null,resolution:'',lines:[
    {id:2,speaker:from.id,text:from.speech,at:0,source:'template',targetIds:[to.id],act:'invite'},
    {id:3,speaker:to.id,text:to.speech,at:0,source:'template',targetIds:[from.id],act:'decline-invitation'},
  ]}];
  f.session.sync();expect(f.pending).toHaveLength(1);
  expect(f.pending[0].payload.conversation).toEqual([]);
  f.pending[0].finish({requestId:f.pending[0].payload.requestId,text:'别闷着，一起谈谈分工吧。',source:'minimind3',latencyMs:1});await flush();
  expect(f.records).toHaveLength(1);expect(f.pending).toHaveLength(2);
  expect(f.pending[1].payload.conversation).toEqual([{speaker:from.name,text:'别闷着，一起谈谈分工吧。'}]);
  expect(f.pending[1].payload.replyContext?.trigger?.text).toBe('别闷着，一起谈谈分工吧。');
  f.pending[1].finish({requestId:f.pending[1].payload.requestId,text:'你们先谈，我暂时不加入。',source:'minimind3',latencyMs:1});await flush();
  expect(f.records).toHaveLength(2);expect(f.records[1].replyToId).toBe('social:42:2');
});
it('persists a delayed reply after movement, behavior, weather, speech expiry and pause without writing simulation', async () => {
  const f = setup(); f.session.sync();
  f.game.elapsed = 100; f.game.weather = 'storm'; f.game.status = 'paused';
  f.game.npcs[0].speech = '我现在要去采集食物。'; f.game.npcs[0].command = 'food'; f.game.npcs[0].position.x += 30;
  const before = structuredClone(f.game); f.session.sync();
  expect(f.pending[0].signal.aborted).toBe(false); reply(f.pending[0]); await flush();
  expect(f.records).toHaveLength(1); expect(f.game).toEqual(before); expect(f.spoken).toHaveBeenCalledOnce();
});
it('does not report success before database acknowledgement and retries the same generated result on save failure', async () => {
  vi.useFakeTimers(); const f = setup();
  f.persist.mockRejectedValueOnce(new Error('disk unavailable'));
  f.session.sync(); reply(f.pending[0]); await flush();
  expect(f.spoken).not.toHaveBeenCalled(); expect(f.session.snapshot().generated).toBe(0);
  expect(f.waiting.mock.calls.at(-1)?.[1]).toContain('disk unavailable');
  await vi.advanceTimersByTimeAsync(10000); await flush();
  expect(f.pending).toHaveLength(1); expect(f.records).toHaveLength(1); expect(f.spoken).toHaveBeenCalledOnce();
});
it('isolates late replies after world reset', async () => {
  const f = setup(); f.session.sync(); f.changeWorld(); f.session.sync();
  expect(f.pending[0].signal.aborted).toBe(true); reply(f.pending[0]); await flush();
  expect(f.records).toHaveLength(0);
});
it('reset during persistence backoff releases the timer and permits requests in the new world', async () => {
  vi.useFakeTimers(); const f = setup(); f.persist.mockRejectedValueOnce(new Error('disk unavailable'));
  f.session.sync(); reply(f.pending[0]); await flush();
  f.changeWorld(); f.session.sync(); expect(f.pending).toHaveLength(2);
  reply(f.pending[1]); await flush(); expect(f.records).toHaveLength(1);
});
it('queues explicit turns independently and sends the acknowledged reply as subsequent conversation history', async () => {
  const f = setup(), npc = f.game.npcs[0];
  f.game.social.threads = [{ id: 42, kind: 'fairness', initiator: npc.id, participants: [npc.id], title: '商量', prompt: '谈谈',
    createdAt: 0, expiresAt: 60, status: 'open', revision: 1, choiceId: null, resolution: '', lines: [
      { id: 1, speaker: 'player', text: '先聊一聊。', at: 0, source: 'player' },
      { id: 2, speaker: npc.id, text: npc.speech, at: 0, source: 'template' },
    ] }];
  f.session.sync();
  f.game.social.threads[0].lines.push({ id: 3, speaker: 'player', text: '我再问一句。', at: 1, source: 'player' },
    { id: 4, speaker: npc.id, text: '我正在听你说话。', at: 1, source: 'template' });
  npc.speech = '我正在听你说话。'; f.game.elapsed = 1; f.session.sync();
  expect(f.pending).toHaveLength(1); expect(f.pending[0].signal.aborted).toBe(false);
  reply(f.pending[0]); await flush();
  expect(f.pending).toHaveLength(2);
  expect(f.pending[1].payload.conversation).toContainEqual({ speaker: npc.name, text: '咱们先把事情说清楚吧。' });
  reply(f.pending[1]); await flush(); expect(f.records.map(r => r.id)).toEqual(['social:42:2', 'social:42:4']);
});
it('world channel never publishes provisional behavior as a code reply and restores final source from records', () => {
  const f = setup(), store = new WorldMessageStore(true); store.capture(f.game);
  expect(store.getSnapshot().filter(m => m.kind === 'npc')).toHaveLength(0);
  store.waiting('turn', '林岚', 0);
  const record: DialogueRecord = { id: 'turn', npcId: f.game.npcs[0].id, text: '咱们先把事情说清楚吧。', source: 'remote:glm', at: 0, latencyMs: 123 };
  store.captureDialogues([record], f.game); store.captureDialogues([record], f.game);
  expect(store.getSnapshot()).toHaveLength(1); expect(store.getSnapshot()[0].source).toBe('remote:glm');
  f.game.npcs[0].speech = '我的不满还在。'; store.capture(f.game);
  expect(store.getSnapshot()).toHaveLength(1);
  const restored = new WorldMessageStore(true); restored.captureDialogues([record], f.game);
  expect(restored.getSnapshot()[0].source).toBe('remote:glm');
  restored.waiting(record.id, '林岚', 0, '另一个标签页还在等待');
  restored.captureDialogues([record], f.game);
  expect(restored.getSnapshot()).toHaveLength(1); expect(restored.dialogueError(record.id)).toBeUndefined();
});
it('keeps social answers while their transcript exists even after 100 ambient replies', () => {
  const f = setup();
  f.game.social.threads = [{ id: 42, lines: [{ id: 2 }] }] as typeof f.game.social.threads;
  const social: DialogueRecord = { id: 'social:42:2', threadId: 42, lineId: 2, npcId: f.game.npcs[0].id, at: 0,
    text: '咱们先把事情说清楚吧。', source: 'minimind3', latencyMs: 10 };
  const ambient = Array.from({ length: 120 }, (_, i) => ({ ...social, id: `ambient:${i}`, threadId: undefined, lineId: undefined }));
  const retained = retainDialogueRecords([social, ...ambient], f.game);
  expect(retained).toHaveLength(101); expect(retained[0]).toEqual(social);
  f.game.social.threads = []; expect(retainDialogueRecords(retained, f.game)).toHaveLength(100);
  expect(retainDialogueRecords([social], f.game)).toEqual([social]); // A thread can expire while inference is running.
});
it('production reply API asks MiniMind to generate text instead of selecting authored candidates', async () => {
  const f = setup(); f.session.sync(); const payload = f.pending[0].payload;
  vi.mocked(modelManager.generate).mockResolvedValue({ requestId: payload.requestId, text: '咱们先把事情说清楚吧。', source: 'minimind3', latencyMs: 1 });
  await generateDialogue(payload, new AbortController().signal);
  const sent = vi.mocked(modelManager.generate).mock.calls[0][0];
  expect(sent.fallbackSelection).toBeUndefined(); expect(sent.fallbackPrompt).toContain('只输出说的话');
});
