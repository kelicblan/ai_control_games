import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorldRuntime } from '../scripts/world/runtime';
import { RemoteCredentialStore } from '../scripts/world/remote-models';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency } from '../src/games/camp/npc/experience';
import { defaultSettings } from '../packages/npc-settings/src';
import { CAMP_SETTINGS_CATALOG } from '../src/games/camp/settings/catalog';

const directories: string[] = [], runtimes: WorldRuntime[] = [];
afterEach(() => {
  runtimes.splice(0).forEach(runtime => runtime.close());
  directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'camp-reset-')); directories.push(dir);
  const file = path.join(dir, 'world.sqlite'); let now = 100000;
  const open = () => { const runtime = new WorldRuntime(file, baselinePolicy, () => now); runtimes.push(runtime); return runtime; };
  const runtime = open();
  runtime.mutate('player', 0, 'old-start', { type: 'start', options: { mode: 'rules', seed: 17 } }, 'tab');
  now += 2000; runtime.tick();
  runtime.mutate('player', 1, 'old-chat', { type: 'command', command: { type: 'social-open', npcId: 'linlan', topic: 'checkin' } }, 'tab');
  runtime.mutate('player', 2, 'old-speed', { type: 'speed', speed: 4 }, 'tab');
  runtime.mutate('player', 3, 'old-gate', { type: 'command', command: { type: 'gate-toggle' } }, 'tab');
  return { runtime, file, open, advance: (ms: number) => { now += ms; } };
}
describe('reset all current-player runtime records', () => {
  it('preserves remote configurations and credentials across reset and reopening', () => {
    const f = fixture();
    const config = { id: 'remote-reset', name: 'Remote', model: 'test-model', baseUrl: 'https://provider.example/v1' };
    let credentials = new RemoteCredentialStore(f.file);
    try {
      credentials.save('player', config, 'test-secret');
      credentials.save('other', config, 'other-secret');
      const before = credentials.list('player');
      f.runtime.mutate('player', 4, 'keep-config-reset', { type: 'reset' }, 'tab');
      credentials.close(); credentials = new RemoteCredentialStore(f.file);
      expect(credentials.list('player')).toEqual(before);
      expect(credentials.credentials('player', config.id).apiKey).toBe('test-secret');
      expect(credentials.credentials('other', config.id).apiKey).toBe('other-secret');
      expect(f.runtime.history('player')).toHaveLength(1);
    } finally { credentials.close(); }
  });
  it('preserves NPC configuration while clearing its runtime state', () => {
    const f = fixture();
    f.runtime.mutate('player', 4, 'configure-agency', {
      type: 'agency-settings', enabled: false, cognition: false, modelId: 'remote-reset',
    }, 'tab');
    const reset = f.runtime.mutate('player', 5, 'keep-agency-reset', { type: 'reset' }, 'tab');
    expect(reset.state!.agency).toMatchObject({ enabled: false, cognition: false, modelId: 'remote-reset', modelBinding: 'dialogue', sequence: 0 });
    f.runtime.close();
    expect(f.open().read('player').state!.agency).toMatchObject({ enabled: false, cognition: false, modelId: 'remote-reset' });
  });
  it('applies saved initial templates without retaining the old NPC mind', () => {
    const f = fixture(), npcSettings = defaultSettings(CAMP_SETTINGS_CATALOG);
    npcSettings.characters.azhuang['body.energy'] = 41;
    const reset = f.runtime.mutate('player', 4, 'configured-reset', { type: 'reset', npcSettings }, 'tab');
    const expected=createGame({seed:64138,npcSettings});ensureAgency(expected);expected.status='playing';
    expect(reset.state).toEqual(expected);
  });
  it('rejects an invalid initial template before deleting any records', () => {
    const f = fixture(), npcSettings = defaultSettings(CAMP_SETTINGS_CATALOG), history = f.runtime.history('player');
    npcSettings.characters.azhuang['body.energy'] = -999;
    expect(() => f.runtime.mutate('player', 4, 'invalid-reset', { type: 'reset', npcSettings }, 'tab')).toThrow();
    expect(f.runtime.history('player')).toEqual(history);
  });
  it('purges history and operations, initializes all state, and survives reopening', () => {
    const f = fixture();
    f.runtime.mutate('other', 0, 'other-start', { type: 'start', options: { seed: 55 } }, 'tab');
    const db = new DatabaseSync(f.file);
    try {
      db.prepare("UPDATE snapshots SET quarantined=1 WHERE player='player' AND revision=1").run();
      expect(f.runtime.history('player').length).toBeGreaterThan(1);
      const reset = f.runtime.mutate('player', 4, 'reset-once', { type: 'reset' }, 'tab');
      const expected=createGame({seed:64138});ensureAgency(expected);expected.status='playing';
      expect(reset.state).toEqual(expected);
      expect(reset.speed).toBe(1); expect(reset.revision).toBe(5); expect(reset.recovered).toBe(false);
      expect(f.runtime.history('player')).toHaveLength(1);
      expect(db.prepare("SELECT operation FROM operations WHERE player='player'").all()).toEqual([{ operation: 'reset-once' }]);
      expect(f.runtime.history('other')).toHaveLength(1);
      f.runtime.close(); const reopened = f.open();
      expect(reopened.read('player').state).toEqual(reset.state);
      expect(reopened.history('player')).toHaveLength(1);
      f.advance(1000); reopened.tick();
      expect(reopened.mutate('player', 4, 'reset-once', { type: 'reset' }, 'tab').state!.elapsed).toBeCloseTo(1);
      expect(() => reopened.mutate('player', 4, 'stale-command', { type: 'command', command: { type: 'gate-toggle' } }, 'old-tab')).toThrow(/修订/);
    } finally { db.close(); }
  });
  it('rolls back history deletion and keeps the visible world if saving the new world fails', () => {
    const f = fixture(), before = structuredClone(f.runtime.read('player'));
    const history = f.runtime.history('player');
    const db = new DatabaseSync(f.file);
    try {
      db.exec("CREATE TRIGGER fail_reset BEFORE INSERT ON snapshots BEGIN SELECT RAISE(ABORT, 'disk failure'); END;");
      expect(() => f.runtime.mutate('player', 4, 'failed-reset', { type: 'reset' }, 'tab')).toThrow('disk failure');
      expect(f.runtime.history('player')).toEqual(history);
      expect(f.runtime.read('player')).toEqual(before);
      expect(db.prepare("SELECT count(*) AS n FROM operations WHERE player='player'").get()!.n).toBe(4);
    } finally { db.close(); }
  });
  it('can discard a long offline replay instead of replaying old history first', () => {
    const f = fixture(); f.advance(86_400_000);
    const reset = f.runtime.mutate('player', 4, 'reset-offline', { type: 'reset' }, 'tab');
    expect(reset.catchingUp).toBe(false); expect(reset.state!.elapsed).toBe(0);
    expect(f.runtime.history('player')).toHaveLength(1);
  });
});
