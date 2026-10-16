import { backup, DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WorldBackupReport {
  version: 1; format: 'campmind-whole-sqlite-backup'; sha256: string; importReady: false;
  validSnapshots: number; quarantinedSnapshots: number;
  tables: { name: string; rows: number; sql: string }[];
}
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';

/** Uses SQLite online backup: never opens the source writable or copies an active .db without its WAL. */
export async function backupWorldForUnity(sourceFile: string, outputDirectory: string): Promise<WorldBackupReport> {
  const source = path.resolve(sourceFile), output = path.resolve(outputDirectory);
  if (!existsSync(source)) throw new Error('Source database missing');
  if (existsSync(output)) throw new Error('Output directory exists; refusing overwrite');
  const db = new DatabaseSync(source, { readOnly: true });
  const target = path.join(output, 'world.sqlite');
  try { mkdirSync(output); await backup(db, target); } finally { db.close(); }
  const copy = new DatabaseSync(target, { readOnly: true });
  try {
    if (copy.prepare('PRAGMA quick_check').get()!.quick_check !== 'ok') throw new Error('SQLite integrity check failed');
    const schema = copy.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if (!schema.some(row => row.name === 'snapshots')) throw new Error('Not a CampMind world database');
    let validSnapshots = 0, quarantinedSnapshots = 0;
    for (const row of copy.prepare('SELECT payload,checksum,quarantined FROM snapshots').iterate()) {
      if (row.quarantined) { quarantinedSnapshots++; continue; }
      if (digest(String(row.payload)) !== row.checksum) throw new Error('Snapshot checksum mismatch; backup retained for diagnosis, import blocked');
      JSON.parse(String(row.payload)); validSnapshots++;
    }
    // A consistent backup is not yet a validated C# import: schema/state/branch
    // migration will be validated by the M4 importer before authority switches.
    const report: WorldBackupReport = { version: 1, format: 'campmind-whole-sqlite-backup', sha256: digest(readFileSync(target)), importReady: false, validSnapshots, quarantinedSnapshots,
      tables: schema.map(row => ({ name: String(row.name), sql: String(row.sql), rows: Number(copy.prepare(`SELECT COUNT(*) AS n FROM ${identifier(String(row.name))}`).get()!.n) })) };
    writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return report;
  } finally { copy.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('Usage: node --import tsx scripts/backup-world-for-unity.ts SOURCE.sqlite NEW_OUTPUT_DIRECTORY');
  const report = await backupWorldForUnity(process.argv[2], process.argv[3]);
  console.log(`Consistent backup verified: ${report.tables.length} tables, ${report.validSnapshots} snapshots. Source untouched.`);
}
