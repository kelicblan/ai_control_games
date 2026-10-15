import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
const requireDigest=(s:string)=>createHash('sha256').update(s).digest('hex');
import { SnapshotStore, type Checkpoint } from '../scripts/world/store';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency, remember, rememberSpeech, reviseSpeechMemory } from '../src/games/camp/npc/experience';
const dirs: string[] = [], stores: SnapshotStore[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'npc-memory-')); dirs.push(dir);
  const file = path.join(dir, 'world.sqlite'); const store = new SnapshotStore(file); stores.push(store);
  const state = createGame(); ensureAgency(state);
  const cp: Checkpoint = { version: 1, state, revision: 1, at: 1000, speed: 1, pauseUntil: null, pauseOwner: null };
  return { file, store, cp };
}
it('commits experiences with checkpoints, deduplicates and isolates players', () => {
  const { store, cp } = fixture();
  remember(cp.state, 'azhuang', 'action', '实际完成了采集。');
  store.save('p', cp); store.save('p', cp);
  expect(store.memories('p', 'azhuang').items).toHaveLength(1);
  expect(store.memories('other', 'azhuang').items).toHaveLength(0);
  expect(store.load('p').checkpoint!.state.agency!.pending).toHaveLength(0);
});
it('rolls back logs and snapshot together when SQL fails', () => {
  const { store, cp, file } = fixture(); store.save('p', cp);
  remember(cp.state, 'azhuang', 'action', '这次工作确实完成。');
  const db = new DatabaseSync(file);
  db.exec("CREATE TRIGGER fail_snapshot BEFORE INSERT ON snapshots BEGIN SELECT RAISE(ABORT, 'failure'); END");
  expect(() => store.save('p', { ...cp, revision: 2 })).toThrow();
  expect(store.memories('p', 'azhuang').items).toHaveLength(0);
  expect(cp.state.agency!.pending).toHaveLength(1);
  db.close();
});
it('forks recovered snapshots without seeing future memories and resets only one player', () => {
  const { store, cp, file } = fixture(); store.save('p', cp); store.save('other', structuredClone(cp));
  remember(cp.state, 'azhuang', 'action', '未来才发生的事。');
  store.save('p', { ...cp, revision: 2 });
  const db = new DatabaseSync(file); db.prepare("UPDATE snapshots SET checksum='broken' WHERE player='p' AND revision=2").run(); db.close();
  const recovered = store.load('p'); expect(recovered.recovered).toBe(true);
  store.save('p', recovered.checkpoint!);
  expect(store.memories('p', 'azhuang').items).toHaveLength(0);
  remember(recovered.checkpoint!.state, 'azhuang', 'action', '恢复后新的经历。');
  store.save('p', recovered.checkpoint!);
  expect(store.memories('p', 'azhuang').items.map(e => e.fact)).toEqual(['恢复后新的经历。']);
  store.save('p', { ...cp, state: createGame(), revision: 4 }, 'reset', true);
  expect(store.memories('p', 'azhuang').items).toHaveLength(0);
  expect(store.load('other').checkpoint).not.toBeNull();
});
it('restores the original utterance version when a later caption snapshot is rolled back',()=>{
  const {store,cp,file}=fixture();rememberSpeech(cp.state,'azhuang','原始说法。',['azhuang']);store.save('p',cp);
  reviseSpeechMemory(cp.state,'azhuang','原始说法。','未来润色。');store.save('p',{...cp,revision:2});
  const db=new DatabaseSync(file);db.prepare("UPDATE snapshots SET checksum='broken' WHERE player='p' AND revision=2").run();db.close();
  const old=store.load('p');store.save('p',old.checkpoint!);
  expect(store.memories('p','azhuang').items[0].fact).toContain('原始说法');
});
it('preserves future agency versions rather than quarantining and silently rolling back',()=>{
  const {store,cp,file}=fixture();store.save('p',cp);
  const db=new DatabaseSync(file),value={...cp,revision:2,state:structuredClone(cp.state)};value.state.agency!.version=2 as 1;
  const payload=JSON.stringify(value);
  db.prepare('INSERT INTO snapshots(player,revision,payload,checksum,saved_at) VALUES(?,?,?,?,?)').run('p',2,payload,requireDigest(payload),2000);db.close();
  expect(()=>store.load('p')).toThrow('不受支持');
});
it('retrieves important relevant old summaries after many newer unrelated batches',()=>{
  const {store,cp}=fixture();
  for(let batch=0;batch<10;batch++){
    for(let i=0;i<64;i++)remember(cp.state,'azhuang','social',batch===0&&i===0?'小米实际帮助了我，伤势有所恢复。':'今天天空的颜色有些变化。','xiaomi',['azhuang'],'experienced','',batch===0&&i===0?1:.1);
    store.save('p',cp);
  }
  expect(store.evidence('p',cp.journal!,'azhuang',0,'小米帮助伤势').some(e=>e.fact.includes('帮助了我'))).toBe(true);
});
