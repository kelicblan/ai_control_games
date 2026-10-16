import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorldRuntime } from '../scripts/world/runtime';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { backupWorldForUnity } from '../scripts/backup-world-for-unity';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'unity-backup-')); dirs.push(dir);
  const source = path.join(dir, 'world.sqlite');
  const runtime = new WorldRuntime(source, baselinePolicy, () => 10000);
  runtime.mutate('migration-test', 0, 'start', { type: 'start', options: { seed: 17 } }, 'tab');
  runtime.mutate('migration-test', 1, 'work', { type: 'command', command: { type: 'social-open', npcId: 'aye', topic: 'food' } }, 'tab');
  return { dir, source, runtime };
}

describe('Unity read-only whole-world backup', () => {
  it('backs up a live WAL database including every table without changing source bytes or state', async () => {
    const { dir, source, runtime } = setup();
    try {
      const before = runtime.read('migration-test');
      const sourceBytes = readFileSync(source);
      const report = await backupWorldForUnity(source, path.join(dir, 'export'));
      expect(readFileSync(source)).toEqual(sourceBytes);
      expect(runtime.read('migration-test')).toEqual(before);
      const tables = report.tables.map(table => table.name);
      for (const name of ['snapshots', 'operations', 'npc_experiences', 'npc_experience_versions', 'npc_appraisals', 'npc_summaries', 'memory_branches', 'conversation_history']) expect(tables).toContain(name);
      expect(report.validSnapshots).toBeGreaterThan(0);
      expect(report.importReady).toBe(false);
      const target = new DatabaseSync(path.join(dir, 'export', 'world.sqlite'), { readOnly: true });
      try {
        expect(target.prepare('PRAGMA quick_check').get()!.quick_check).toBe('ok');
        for (const table of report.tables) expect(Number(target.prepare(`SELECT COUNT(*) AS n FROM "${table.name}"`).get()!.n)).toBe(table.rows);
      } finally { target.close(); }
      const hash = createHash('sha256').update(readFileSync(path.join(dir, 'export', 'world.sqlite'))).digest('hex');
      expect(report.sha256).toBe(hash);
      expect(JSON.parse(readFileSync(path.join(dir, 'export', 'manifest.json'), 'utf8'))).toEqual(report);
      await expect(backupWorldForUnity(source, path.join(dir, 'export'))).rejects.toThrow('exists');
    } finally { runtime.close(); }
  });

  it('rejects missing files, source overwrite and corrupt nonquarantined snapshots', async () => {
    const { dir, source, runtime } = setup(); runtime.close();
    await expect(backupWorldForUnity(path.join(dir, 'missing.sqlite'), path.join(dir, 'missing-export'))).rejects.toThrow();
    await expect(backupWorldForUnity(source, dir)).rejects.toThrow('exists');
    const db = new DatabaseSync(source);
    db.prepare('UPDATE snapshots SET checksum=?').run('0'.repeat(64)); db.close();
    await expect(backupWorldForUnity(source, path.join(dir, 'corrupt-export'))).rejects.toThrow('checksum');
  });
});
