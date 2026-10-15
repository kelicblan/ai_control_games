import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorldRuntime } from '../scripts/world/runtime';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import type { GameCommand } from '../src/games/camp/simulation/types';

const directories: string[] = [], runtimes: WorldRuntime[] = [];
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'camp-lord-')); directories.push(directory);
  const file = path.join(directory, 'world.sqlite'); let now = 100000;
  const open = () => { const runtime = new WorldRuntime(file, baselinePolicy, () => now); runtimes.push(runtime); return runtime; };
  const runtime = open(); runtime.mutate('p', 0, 'start', { type: 'start', options: { mode: 'rules', seed: 17 } }, 'tab');
  return { file, runtime, open, advance: (ms: number) => { now += ms; } };
}
afterEach(() => { runtimes.splice(0).forEach(runtime => runtime.close()); directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })); });
const right: GameCommand = { type: 'lord-input', playerId: 'local-player', direction: { x: 1, y: 0 } };

describe('lord input world protocol', () => {
  it('accepts input without changing position, then advances from simulation ticks', () => {
    const f = fixture(), origin = { ...f.runtime.read('p').state!.lord!.position };
    const sent = f.runtime.mutate('p', 1, 'move', { type: 'command', command: right }, 'tab');
    expect(sent.state!.lord!.position).toEqual(origin);
    f.advance(100); expect(f.runtime.read('p').state!.lord!.position.x).toBeCloseTo(origin.x + .8);
  });
  it.each([
    { ...right, playerId: 'other' }, { ...right, direction: { x: Infinity, y: 0 } },
    { ...right, direction: { x: 2, y: 0 } }, { ...right, direction: null },
  ])('rejects invalid input %j', command => {
    const f = fixture();
    expect(() => f.runtime.mutate('p', 1, 'invalid', { type: 'command', command: command as GameCommand }, 'tab')).toThrow(/操作无效/);
  });
  it('expires held movement by wall time before offline catch-up', () => {
    const f = fixture(), origin = { ...f.runtime.read('p').state!.lord!.position };
    f.runtime.mutate('p', 1, 'move', { type: 'command', command: right }, 'tab');
    f.advance(100); f.runtime.tick(); const moved = { ...f.runtime.read('p').state!.lord!.position };
    expect(moved.x).toBeGreaterThan(origin.x);
    f.advance(1000); const stopped = f.runtime.read('p').state!.lord!;
    expect(stopped.position).toEqual(moved); expect(stopped.input).toEqual({ x: 0, y: 0 });
  });
  it('does not restore a held direction after reopening a saved world', () => {
    const f = fixture(); const sent = f.runtime.mutate('p', 1, 'move', { type: 'command', command: right }, 'tab');
    const origin = { ...sent.state!.lord!.position }; f.runtime.close(); f.advance(200);
    const restored = f.open().read('p').state!.lord!;
    expect(restored.position).toEqual(origin); expect(restored.input).toEqual({ x: 0, y: 0 });
  });
  it('clears input when paused so resume cannot reuse held movement', () => {
    const f = fixture(); f.runtime.mutate('p', 1, 'move', { type: 'command', command: right }, 'tab');
    f.runtime.mutate('p', 2, 'pause', { type: 'pause', paused: true }, 'tab');
    const origin = { ...f.runtime.read('p').state!.lord!.position };
    f.runtime.mutate('p', 3, 'resume', { type: 'pause', paused: false }, 'tab'); f.advance(100);
    expect(f.runtime.read('p').state!.lord!.position).toEqual(origin);
  });
  it('keeps heartbeat renewals out of durable operation history', () => {
    const f = fixture();
    for (let i = 0; i < 12; i++) f.runtime.mutate('p', i + 1, `heartbeat-${i}`, { type: 'command', command: right }, 'tab');
    expect(f.runtime.history('p')).toHaveLength(1);
    const database = new DatabaseSync(f.file);
    try { expect(database.prepare('SELECT COUNT(*) AS n FROM operations').get()!.n).toBe(1); } finally { database.close(); }
  });
  it('zeros a nonzero movement command received during pause', () => {
    const f = fixture(); f.runtime.mutate('p', 1, 'pause', { type: 'pause', paused: true }, 'tab');
    const sent = f.runtime.mutate('p', 2, 'move', { type: 'command', command: right }, 'tab');
    expect(sent.state!.lord!.input).toEqual({ x: 0, y: 0 });
    const origin = { ...sent.state!.lord!.position };
    f.runtime.mutate('p', 3, 'resume', { type: 'pause', paused: false }, 'tab'); f.advance(100);
    expect(f.runtime.read('p').state!.lord!.position).toEqual(origin);
  });
});
