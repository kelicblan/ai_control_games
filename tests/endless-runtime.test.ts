import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorldRuntime } from '../scripts/world/runtime';
import { SnapshotStore } from '../scripts/world/store';
import { createGame } from '../src/games/camp/simulation/engine';
import { getCampClock } from '../src/games/camp/simulation/clock';
import { ACTIONS, type PolicyFunction } from '../src/games/camp/simulation/types';

const idle: PolicyFunction = () => ({ action: 'camp', emotion: 'calm', source: 'rules', latencyMs: 0,
  scores: ACTIONS.map(action => Number(action === 'camp')) });
const directories: string[] = [], runtimes: WorldRuntime[] = [];
function fixture(elapsed: number, maxSteps = 3) {
  const directory = mkdtempSync(path.join(tmpdir(), 'camp-endless-')); directories.push(directory);
  const file = path.join(directory, 'world.sqlite'); let now = 100_000;
  const open = () => { const runtime = new WorldRuntime(file, idle, () => now, maxSteps); runtimes.push(runtime); return runtime; };
  const runtime = open(), state = createGame({ mode: 'model', seed: 17 });
  Object.assign(state, { status: 'playing', elapsed, day: getCampClock(elapsed).day, fire: 100,
    nextWorldEvent: elapsed + 30, weatherUntil: elapsed + 100 });
  state.world!.ecology!.updatedAt=elapsed;
  runtime.mutate('p', 0, 'import', { type: 'import', state }, 'tab');
  return { runtime, open, advance: (ms: number) => { now += ms; } };
}
afterEach(() => { runtimes.splice(0).forEach(runtime => runtime.close()); directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })); });

describe('endless authoritative world runtime', () => {
  it('restores a former fire loss paused without replaying the hours spent ended', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'camp-fire-migration-')); directories.push(directory);
    const file = path.join(directory, 'world.sqlite');
    const state = createGame();
    Object.assign(state, { status: 'lost', elapsed: 700, wood: 0, fire: 0,
      resultReason: '篝火熄灭了，营地无法继续抵挡寒夜。下次提前准备木材和添柴的人手。' });
    delete state.world!.ecology; // Genuine historical saves predate ecology.
    const store = new SnapshotStore(file);
    store.save('p', { version: 1, state, revision: 1, speed: 1, at: 1000, pauseUntil: null, pauseOwner: null });
    store.close();
    let now = 3_601_000;
    const runtime = new WorldRuntime(file, idle, () => now); runtimes.push(runtime);
    const loaded = runtime.read('p');
    expect(loaded.state).toMatchObject({ status: 'paused', elapsed: 700, fire: 0, resultReason: '' });
    expect(loaded.catchingUp).toBe(false);
    runtime.mutate('p', loaded.revision, 'resume', { type: 'pause', paused: false }, 'tab');
    now += 200;
    expect(runtime.read('p').state).toMatchObject({ status: 'playing', elapsed: 700.2, fire: 0 });
  });
  it.each([239.8, 599.8])('advances through elapsed %s without a session deadline', elapsed => {
    const f = fixture(elapsed); f.advance(300);
    const result = f.runtime.read('p');
    expect(result.state!.elapsed).toBeCloseTo(elapsed + .3);
    expect(result.state!.status).toBe('playing');
    expect(result.state!.day).toBe(getCampClock(elapsed + .3).day);
    expect(result.catchingUp).toBe(false);
  });

  it('persists and reopens a later day with the same cyclic calendar', () => {
    const f = fixture(10_199.8, 10); f.advance(1000);
    const saved = f.runtime.read('p');
    expect(saved.state!.elapsed).toBeCloseTo(10_200.8);
    expect(saved.state!.day).toBe(18);
    f.runtime.close();
    const restored = f.open().read('p');
    expect(restored.state!.elapsed).toBe(saved.state!.elapsed);
    expect(restored.state!.day).toBe(saved.state!.day);
    expect(restored.state!.status).toBe('playing');
    expect(restored.state!.lord!.input).toEqual({ x: 0, y: 0 });
  });

  it('retains a bounded offline catch-up budget after the former deadline', () => {
    const f = fixture(599.8); f.advance(5000);
    const first = f.runtime.read('p');
    expect(first.state!.elapsed).toBeCloseTo(600.1);
    expect(first.catchingUp).toBe(true);
    const second = f.runtime.read('p');
    expect(second.state!.elapsed).toBeCloseTo(600.4);
    expect(second.catchingUp).toBe(true);
    let last = second;
    for (let index = 0; index < 20 && last.catchingUp; index++) last = f.runtime.read('p');
    expect(last.state!.elapsed).toBeCloseTo(604.8);
    expect(last.catchingUp).toBe(false);
  });
});
