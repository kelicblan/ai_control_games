import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { validExperience, type Experience } from '../../packages/npc-core/src';
export interface Journal { version: 1; generation: string; branch: string; watermark: number }
export function validJournal(j: unknown): j is Journal {
  if (!j || typeof j !== 'object') return false;
  const v = j as Journal;
  return v.version === 1 && typeof v.generation === 'string' && v.generation.length <= 100
    && typeof v.branch === 'string' && v.branch.length <= 100 && Number.isSafeInteger(v.watermark) && v.watermark >= 0;
}
export function newJournal(): Journal { return { version: 1, generation: randomUUID(), branch: randomUUID(), watermark: 0 }; }
export function forkJournal(db: DatabaseSync, player: string, old: Journal): Journal {
  const branch = randomUUID();
  db.prepare('INSERT INTO memory_branches VALUES(?,?,?,?,?)').run(player, old.generation, branch, old.branch, old.watermark);
  return { ...old, branch };
}
export function writeExperiences(db: DatabaseSync, player: string, j: Journal, events: Experience[]) {
  db.prepare('INSERT OR IGNORE INTO memory_branches VALUES(?,?,?,?,?)').run(player, j.generation, j.branch, null, 0);
  const insert = db.prepare(`INSERT OR IGNORE INTO npc_experiences VALUES(?,?,?,?,?,?,?)`);
  const version = db.prepare('INSERT OR IGNORE INTO npc_experience_versions VALUES(?,?,?,?,?,?,?)');
  for (const e of events) {
    if (!validExperience(e)) throw new Error('NPC 经历格式无效');
    insert.run(player,j.generation,j.branch,e.npcId,e.sequence,e.eventId,JSON.stringify(e));
    version.run(player,j.generation,j.branch,e.npcId,e.sequence,e.eventId,JSON.stringify(e));
  }
}
export function readExperiences(db: DatabaseSync, player: string, j: Journal, npc: string, before = Number.MAX_SAFE_INTEGER, limit = 30): Experience[] {
  const rows=db.prepare(`WITH RECURSIVE lineage(branch,cap,depth) AS (
    SELECT ?,?,0 UNION ALL SELECT b.parent,MIN(l.cap,b.fork_watermark),l.depth+1 FROM memory_branches b JOIN lineage l ON b.branch=l.branch
    WHERE b.player=? AND b.generation=? AND b.parent IS NOT NULL AND l.depth<128),
    visible AS (SELECT e.payload,e.sequence,ROW_NUMBER() OVER(PARTITION BY e.event_id ORDER BY e.sequence DESC,l.depth ASC) AS rank
    FROM npc_experience_versions e JOIN lineage l ON l.branch=e.branch WHERE e.player=? AND e.generation=? AND e.npc=? AND e.sequence<=l.cap)
    SELECT payload FROM visible WHERE rank=1 AND sequence<? ORDER BY sequence DESC LIMIT ?`).all(j.branch,j.watermark,player,j.generation,player,j.generation,npc,before,limit);
  return rows.map(row=>{const e:unknown=JSON.parse(String(row.payload));if(!validExperience(e))throw new Error('NPC 经历记录损坏');return e;});
}
export function clearMemories(db: DatabaseSync, player: string) {
  for (const table of ['npc_experience_versions','npc_experiences','npc_summaries','npc_appraisals','memory_branches']) db.prepare(`DELETE FROM ${table} WHERE player=?`).run(player);
}
