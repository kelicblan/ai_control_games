import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { WorldRuntime } from '../scripts/world/runtime';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { fingerprint } from '../src/games/camp/dialogue/context';
import { SnapshotStore } from '../scripts/world/store';

const directories: string[] = [];
const runtimes: WorldRuntime[] = [];
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'camp-world-')); directories.push(dir);
  const file = path.join(dir, 'world.sqlite');
  let now = 100000;
  const open = () => { const runtime = new WorldRuntime(file, baselinePolicy, () => now); runtimes.push(runtime); return runtime; };
  return { file, open, advance: (ms: number) => { now += ms; } };
}
afterEach(() => { vi.restoreAllMocks(); for (const runtime of runtimes.splice(0)) runtime.close(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe('durable authoritative world', () => {
  it('does not classify time spent saving the current tick as offline backlog', () => {
    const f = fixture(), world = f.open();
    world.mutate('p', 0, 'start', { type: 'start', options: { mode: 'rules' } }, 'tab');
    const save = SnapshotStore.prototype.save;
    vi.spyOn(SnapshotStore.prototype, 'save').mockImplementation(function (this: SnapshotStore, ...args) {
      save.apply(this, args); f.advance(150);
    });
    f.advance(1000);
    expect(world.read('p').catchingUp).toBe(false);
  });
  it('accepts commands when simulation crosses a wall-clock tick after catching up to its target', () => {
    const f = fixture(); let now = 100000, costly = false;
    const world = new WorldRuntime(f.file, observation => {
      if (costly) { now += 150; costly = false; }
      return baselinePolicy(observation);
    }, () => now);
    runtimes.push(world);
    const first = world.mutate('p', 0, 'start', { type: 'start', options: { mode: 'model' } }, 'tab');
    now += 100; costly = true;
    expect(() => world.mutate('p', first.revision, 'speed', { type: 'speed', speed: 2 }, 'tab')).not.toThrow();
    expect(costly).toBe(false);
  });
  it('saves generated dialogue during real offline catch-up, survives restart and keeps gameplay guarded', () => {
    const f = fixture(), world = f.open();
    const first = world.mutate('p', 0, 'start', { type: 'start', options: { mode: 'rules' } }, 'tab');
    f.advance(60000);
    const result = { id: 'ambient:offline', npcId: first.state!.npcs[0].id, at: 0,
      text: '咱们先把事情说清楚吧。', source: 'minimind3', latencyMs: 12000 };
    const action = { type: 'dialogue-result' as const, scope: first.dialogueScope!, result };
    const saved = world.mutate('p', first.revision, 'save-reply', action, 'tab');
    expect(saved.catchingUp).toBe(true); expect(saved.dialogues).toEqual([result]);
    expect(() => world.mutate('p', saved.revision, 'speed', { type: 'speed', speed: 4 }, 'tab')).toThrow('正在补算');
    world.close(); const reopened = f.open(), restored = reopened.read('p');
    expect(restored.dialogues).toEqual([result]);
    expect(reopened.mutate('p', first.revision, 'save-reply', action, 'tab').dialogues).toEqual([result]);
    expect(() => reopened.mutate('p', restored.revision, 'wrong-scope', { ...action, scope: 'old:world' }, 'tab')).toThrow('对话所属世界已变化');
  });
  it('stores dialogue independently of live behavior, survives restart, deduplicates and rejects an old world scope', () => {
    const f = fixture(), world = f.open();
    const first = world.mutate('p', 0, 'start-independent', { type: 'start', options: { seed: 17, mode: 'rules' } }, 'tab');
    const scope = first.dialogueScope!;
    f.advance(3000); world.tick();
    const before = structuredClone(world.read('p').state);
    const result = { id: 'ambient:test', npcId: first.state!.npcs[0].id, at: 0, text: '咱们先把事情说清楚吧。', source: 'minimind3', latencyMs: 12000 };
    const saved = world.mutate('p', first.revision, 'result', { type: 'dialogue-result', scope, result }, 'tab');
    expect(saved.state).toEqual(before); expect(saved.dialogues).toEqual([result]);
    const duplicate = world.mutate('p', saved.revision, 'duplicate', { type: 'dialogue-result', scope, result }, 'tab');
    expect(duplicate.dialogues).toHaveLength(1); world.close();
    const reopened = f.open(), restored = reopened.read('p'); expect(restored.dialogues).toEqual([result]);
    const reset = reopened.mutate('p', restored.revision, 'reset-dialogue', { type: 'reset' }, 'tab');
    expect(reset.dialogues).toEqual([]);
    expect(() => reopened.mutate('p', reset.revision, 'late', { type: 'dialogue-result', scope, result }, 'tab')).toThrow('对话所属世界已变化');
  });
  it.each([1, 13])('bounds late caption publication to a short grace window (%s seconds)', age => {
    const f = fixture(), world = f.open();
    const initial = world.mutate('p', 0, 'start', { type: 'start', options: { seed: 64138, mode: 'rules' } }, 'tab');
    // Isolate expiry from action changes: no wall-clock simulation steps occur during this guard test.
    initial.state!.elapsed = 20;
    initial.state!.world!.ecology!.updatedAt = 20;
    const npc = initial.state!.npcs[0]; npc.speech = '我在听，你慢慢说。'; npc.speechUntil = 20 - age;
    const current = initial.state!.npcs[0];
    const updated = world.mutate('p', initial.revision, 'caption', { type: 'caption', npcId: current.id,
      beforeSpeech: current.speech, beforeUntil: current.speechUntil, beforeFingerprint: fingerprint(initial.state!, current),
      text: '咱们把眼前的安排说清楚吧。', source: 'minimind3' }, 'tab');
    expect(updated.state!.npcs[0].speechOrigin?.source === 'minimind3').toBe(age <= 12);
  });
  it('advances without a browser and catches up after process restart', () => {
    const f = fixture(); const world = f.open();
    world.mutate('player', 0, 'start', { type: 'start', options: { mode: 'rules', seed: 41 } }, 'tab');
    f.advance(2000); world.tick();
    expect(world.read('player').state!.elapsed).toBeCloseTo(2);
    world.close(); f.advance(3000);
    expect(f.open().read('player').state!.elapsed).toBeCloseTo(5);
  });
  it('persists speed and explicit pause, while temporary dialog pauses expire', () => {
    const f = fixture(); const world = f.open();
    world.mutate('player', 0, 'a', { type: 'start', options: { mode: 'rules' } }, 'tab');
    world.mutate('player', 1, 'b', { type: 'speed', speed: 4 }, 'tab');
    f.advance(1000); world.tick(); expect(world.read('player').state!.elapsed).toBeCloseTo(4);
    world.mutate('player', 2, 'c', { type: 'pause', paused: true, temporary: false }, 'tab');
    world.close(); f.advance(5000); const reopened = f.open();
    expect(reopened.read('player').state!.elapsed).toBeCloseTo(4);
    reopened.mutate('player', 3, 'd', { type: 'pause', paused: false }, 'tab');
    reopened.mutate('player', 4, 'e', { type: 'pause', paused: true, temporary: true }, 'tab');
    f.advance(4000); reopened.tick(); expect(reopened.read('player').state!.elapsed).toBeCloseTo(8);
  });
  it('rejects stale commands and deduplicates committed operations', () => {
    const f = fixture(); const world = f.open();
    const action = { type: 'start' as const, options: { mode: 'rules' as const } };
    world.mutate('player', 0, 'same', action, 'tab');
    f.advance(1000); world.tick();
    expect(world.mutate('player', 0, 'same', action, 'tab').state!.elapsed).toBeCloseTo(1);
    expect(() => world.mutate('player', 0, 'different', action, 'tab')).toThrow(/修订/);
  });
  it('retains corrupt snapshots and falls back using earlier checkpoint time', () => {
    const f = fixture(); const world = f.open();
    world.mutate('player', 0, 'a', { type: 'start', options: { mode: 'rules' } }, 'tab');
    f.advance(1000); world.tick(); world.close();
    const db = new DatabaseSync(f.file);
    db.exec("UPDATE snapshots SET payload = 'broken' WHERE id = (SELECT MAX(id) FROM snapshots)"); db.close();
    f.advance(1000); const restored = f.open().read('player');
    expect(restored.recovered).toBe(true); expect(restored.state!.elapsed).toBeCloseTo(2);
    const inspect = new DatabaseSync(f.file);
    expect(inspect.prepare("SELECT count(*) AS n FROM snapshots WHERE payload='broken'").get()!.n).toBe(1); inspect.close();
  });
  it('blocks overwriting when every snapshot is invalid', () => {
    const f = fixture(); const world = f.open();
    world.mutate('player', 0, 'a', { type: 'start', options: { mode: 'rules' } }, 'tab'); world.close();
    const db = new DatabaseSync(f.file); db.exec("UPDATE snapshots SET payload='broken'"); db.close();
    expect(() => f.open().read('player')).toThrow(/恢复/);
  });
  it('uses the same fixed-step behavior continuously and after downtime', () => {
    const a = fixture(); const b = fixture(); const continuous = a.open(); const restarted = b.open();
    const action = { type: 'start' as const, options: { mode: 'rules' as const, seed: 19 } };
    continuous.mutate('p', 0, 'a', action, 'tab'); restarted.mutate('p', 0, 'a', action, 'tab');
    for (let step = 0; step < 30; step++) { a.advance(100); continuous.tick(); }
    restarted.close(); b.advance(3000);
    const actual = b.open().read('p').state!; const expected = continuous.read('p').state!;
    expect(actual.npcs).toEqual(expected.npcs); expect(actual.randomState).toBe(expected.randomState);
    expect(actual.social).toEqual(expected.social); expect(actual.fire).toBe(expected.fire);
  });
  it('bounds long catch-up per request without a session deadline and ignores backward clocks', () => {
    const f = fixture(); const world = f.open();
    world.mutate('p', 0, 'a', { type: 'start', options: { mode: 'rules' } }, 'tab');
    f.advance(-1000); expect(world.read('p').state!.elapsed).toBe(0);
    // Replay is sliced so service requests can respond during a long catch-up.
    f.advance(86_401_000);
    const first = world.read('p');
    expect(first.catchingUp).toBe(true);
    expect(first.state!.elapsed).toBeCloseTo(5);
    const next = world.read('p');
    expect(next.state!.status).toBe('playing');
    expect(next.state!.elapsed).toBeCloseTo(10);
    expect(next.catchingUp).toBe(true);
  }, 30000);
  it('renews only the owning modal and never releases an explicit pause', () => {
    const f = fixture(); const world = f.open();
    world.mutate('p', 0, 'a', { type: 'start', options: { mode: 'rules' } }, 'tab');
    world.mutate('p', 1, 'b', { type: 'pause', paused: true, temporary: true }, 'tab');
    f.advance(2000); world.read('p', 'tab'); f.advance(2000);
    expect(world.read('p', 'other').state!.status).toBe('paused');
    world.mutate('p', 2, 'c', { type: 'pause', paused: false, temporary: true }, 'other');
    expect(world.read('p').state!.status).toBe('paused');
    world.mutate('p', 2, 'd', { type: 'pause', paused: true }, 'tab');
    world.mutate('p', 3, 'e', { type: 'pause', paused: false, temporary: true }, 'tab');
    f.advance(10000); expect(world.read('p').state!.status).toBe('paused');
  });
  it('imports only into an empty world and preserves future-version evidence', () => {
    const f = fixture(); const world = f.open();
    const state = world.mutate('p', 0, 'a', { type: 'start', options: { mode: 'rules' } }, 'tab').state!;
    world.mutate('legacy', 0, 'b', { type: 'import', state }, 'tab');
    expect(() => world.mutate('legacy', 1, 'c', { type: 'import', state }, 'tab')).toThrow();
    world.close(); const db = new DatabaseSync(f.file);
    const payload = JSON.stringify({ version: 2, state });
    db.prepare('UPDATE snapshots SET payload=?, checksum=? WHERE player=?').run(payload, createHash('sha256').update(payload).digest('hex'), 'p'); db.close();
    expect(() => f.open().read('p')).toThrow(/版本/);
  });
  it.each(['minimind3', 'native:gamesoul', 'remote:custom'] as const)('preserves %s caption attribution but rejects a stale behavioral fingerprint', source => {
    const f = fixture(); const world = f.open();
    world.mutate('p', 0, 'a', { type: 'start', options: { mode: 'rules' } }, 'tab');
    f.advance(100); const state = world.read('p').state!;
    const npc = state.npcs.find(n => n.speechUntil > state.elapsed)!;
    const action = { type: 'caption' as const, npcId: npc.id, beforeSpeech: npc.speech, beforeUntil: npc.speechUntil,
      beforeFingerprint: fingerprint(state, npc), text: '大家一起守住营地，今晚平安。', source };
    const rejected = world.mutate('p', 1, 'b', { ...action, beforeFingerprint: 'stale' }, 'tab');
    expect(rejected.state!.npcs.find(n => n.id === npc.id)!.speech).toBe(npc.speech);
    const accepted = world.mutate('p', 1, 'c', action, 'tab');
    expect(accepted.state!.npcs.find(n => n.id === npc.id)!.speech).toBe(action.text);
    expect(accepted.state!.npcs.find(n => n.id === npc.id)!.speechOrigin).toMatchObject({ text: action.text, source });
    expect(f.open().read('p').state!.npcs.find(n => n.id === npc.id)!.speechOrigin?.source).toBe(source);
    expect(accepted.state!.food).toBe(state.food); expect(accepted.state!.fire).toBe(state.fire);
  });
});
