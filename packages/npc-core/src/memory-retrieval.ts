import type { Experience, MemorySummary } from './memory-types';
export function retrieveMemories(events: readonly Experience[], context: { npcId: string; now: number; query: string; actorId?: string; limit: number }) {
  const tokens = context.query.match(/.{1,2}/gu) ?? [];
  return events.filter(e => e.npcId === context.npcId && e.audience.includes(context.npcId) && e.at <= context.now)
    .map(e => ({ e, score: e.salience * 3 + tokens.reduce((s,t)=>s+Number((e.fact+e.interpretation).includes(t)),0)
      + Number(e.actorId === context.actorId) + (/未兑现|被拒绝|失约|尚未解决/.test(e.fact) ? 2 : 0) + 1/(1+(context.now-e.at)/120) }))
    .sort((a,b)=>b.score-a.score || b.e.sequence-a.e.sequence).slice(0,Math.min(12,Math.max(0,context.limit))).map(x=>x.e);
}
export function summarizeMemories(npcId: string, events: readonly Experience[]): MemorySummary {
  const known = events.filter(e=>e.npcId===npcId).sort((a,b)=>b.salience-a.salience || b.sequence-a.sequence).slice(0,12);
  return { npcId, through: Math.max(0,...events.map(e=>e.sequence)), version:1,
    text:known.map(e=>`[${e.eventId}]${e.fact}`).join('\n').slice(0,2400), evidenceIds:known.map(e=>e.eventId) };
}
