import type { DatabaseSync } from 'node:sqlite';
export function createMemorySchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS npc_memory_schema(version INTEGER NOT NULL);
    INSERT INTO npc_memory_schema SELECT 2 WHERE NOT EXISTS(SELECT 1 FROM npc_memory_schema);
    CREATE TABLE IF NOT EXISTS memory_branches(player TEXT NOT NULL,generation TEXT NOT NULL,branch TEXT NOT NULL,parent TEXT,fork_watermark INTEGER NOT NULL,PRIMARY KEY(player,generation,branch));
    CREATE TABLE IF NOT EXISTS npc_experiences(player TEXT NOT NULL,generation TEXT NOT NULL,branch TEXT NOT NULL,npc TEXT NOT NULL,sequence INTEGER NOT NULL,event_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(player,generation,branch,event_id));
    CREATE INDEX IF NOT EXISTS npc_experiences_page ON npc_experiences(player,generation,branch,npc,sequence DESC);
    CREATE TABLE IF NOT EXISTS npc_summaries(player TEXT NOT NULL,generation TEXT NOT NULL,branch TEXT NOT NULL,npc TEXT NOT NULL,through INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(player,generation,branch,npc,through));
    CREATE TABLE IF NOT EXISTS npc_appraisals(player TEXT NOT NULL,generation TEXT NOT NULL,branch TEXT NOT NULL,request_id TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(player,generation,branch,request_id));`);
  if (db.prepare('SELECT version FROM npc_memory_schema').all().some(r => r.version !== 1 && r.version !== 2)) throw new Error('NPC 记忆版本不受支持，已保留数据库');
  db.exec(`CREATE TABLE IF NOT EXISTS npc_experience_versions(player TEXT NOT NULL,generation TEXT NOT NULL,branch TEXT NOT NULL,npc TEXT NOT NULL,sequence INTEGER NOT NULL,event_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(player,generation,branch,event_id,sequence));
    CREATE INDEX IF NOT EXISTS npc_experience_versions_page ON npc_experience_versions(player,generation,branch,npc,sequence DESC);`);
  if(db.prepare('SELECT version FROM npc_memory_schema').all().some(r=>r.version===1)){
    db.exec('BEGIN IMMEDIATE');
    try{db.exec('INSERT OR IGNORE INTO npc_experience_versions SELECT * FROM npc_experiences; UPDATE npc_memory_schema SET version=2; COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  }
}
