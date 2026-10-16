import type { DatabaseSync } from 'node:sqlite';
import { summarizeMemories, type Experience } from '../../packages/npc-core/src';
import { readExperiences, type Journal } from './memory-store';
export function maintainSummaries(db:DatabaseSync,player:string,j:Journal,npc:string) {
  const last=db.prepare('SELECT MAX(through) AS n FROM npc_summaries WHERE player=? AND generation=? AND branch=? AND npc=?').get(player,j.generation,j.branch,npc);
  const events=readExperiences(db,player,j,npc,Number.MAX_SAFE_INTEGER,64).filter(e=>e.sequence>Number(last?.n??0));
  if(events.length<64)return;
  const summary=summarizeMemories(npc,events), selected=events.filter(e=>summary.evidenceIds.includes(e.eventId));
  db.prepare('INSERT OR IGNORE INTO npc_summaries VALUES(?,?,?,?,?,?)').run(player,j.generation,j.branch,npc,summary.through,JSON.stringify({summary,events:selected}));
}
export function summaryEvidence(db:DatabaseSync,player:string,j:Journal,npc:string,query=''):Experience[] {
  const result:Experience[]=[]; let branch:string|null=j.branch, cap=j.watermark; const seen=new Set<string>();
  const tokens=[...new Set(query.match(/[\u4e00-\u9fff]{2}|[a-z]{3,}/giu)??[])].slice(0,12);
  const relevance=tokens.length?tokens.map(()=>'(CASE WHEN instr(payload,?)>0 THEN 1 ELSE 0 END)').join('+'):'0';
  while(branch&&!seen.has(branch)) {
    seen.add(branch);
    const rows=db.prepare(`SELECT payload FROM npc_summaries WHERE player=? AND generation=? AND branch=? AND npc=? AND through<=? ORDER BY (${relevance}) DESC,through DESC LIMIT 8`).all(player,j.generation,branch,npc,cap,...tokens);
    for(const row of rows){const v=JSON.parse(String(row.payload));result.push(...v.events);}
    const parent:Record<string,unknown>|undefined=db.prepare('SELECT parent,fork_watermark FROM memory_branches WHERE player=? AND generation=? AND branch=?').get(player,j.generation,branch);
    cap=Math.min(cap,Number(parent?.fork_watermark??0));branch=parent?.parent?String(parent.parent):null;
  }
  return result;
}
