import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
/** Executed inside SnapshotStore's reset transaction, not on a second SQLite writer. */
export function stageVillageReset(db:DatabaseSync,owner:string){
 const exists=(table:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
 const worlds=exists('village_worlds_v1')?db.prepare('SELECT world_id FROM village_worlds_v1 WHERE owner=?').all(owner).map(r=>String(r.world_id)):[];
 for(const world of worlds)for(const table of ['village_animals_v1','village_runtime_speed_v1','pixel_wildlife_regions'])if(exists(table))db.prepare(`DELETE FROM ${table} WHERE world_id=?`).run(world);
 for(const table of ['village_worlds_v1','village_history_v1','village_runtime_clock_v1','village_migration_v1'])if(exists(table))db.prepare(`DELETE FROM ${table} WHERE owner=?`).run(owner);
 db.exec('CREATE TABLE IF NOT EXISTS village_reset_pending_v1(owner TEXT PRIMARY KEY,world_id TEXT NOT NULL,seed INTEGER NOT NULL)');
 const worldId='campaign-'+randomUUID().replaceAll('-','').slice(0,24);
 db.prepare('INSERT INTO village_reset_pending_v1 VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET world_id=excluded.world_id,seed=excluded.seed').run(owner,worldId,64138);
}
