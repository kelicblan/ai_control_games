import { AGENCY_V1 } from './agency-config';
import { EXPERIENCE_CATEGORIES, type Experience, type MemoryState } from './memory-types';
export const createMemory = (): MemoryState => ({ watermark: 0, recent: [] });
const bounded = (x: unknown, max: number, min = 0): x is string => typeof x === 'string' && x.length >= min && x.length <= max;
export function validExperience(value: unknown): value is Experience {
  if (!value || typeof value !== 'object') return false;
  const e = value as Experience;
  return Object.keys(e).every(k => ['eventId','sequence','at','npcId','category','actorId','audience','fact','interpretation','evidenceIds','source','salience'].includes(k))
    && bounded(e.eventId, 160, 1) && Number.isSafeInteger(e.sequence) && e.sequence > 0
    && Number.isFinite(e.at) && e.at >= 0 && bounded(e.npcId, 100, 1) && bounded(e.actorId, 100, 1)
    && EXPERIENCE_CATEGORIES.includes(e.category) && ['experienced', 'heard', 'self'].includes(e.source)
    && Array.isArray(e.audience) && e.audience.length <= 32 && e.audience.includes(e.npcId) && e.audience.every(x => bounded(x, 100, 1))
    && bounded(e.fact, 400, 1) && bounded(e.interpretation, 280) && Array.isArray(e.evidenceIds)
    && e.evidenceIds.length <= 12 && e.evidenceIds.every(x => bounded(x, 160, 1)) && Number.isFinite(e.salience) && e.salience >= 0 && e.salience <= 1;
}
export function appendExperience(memory: MemoryState, event: Experience): boolean {
  if (!validExperience(event) || event.sequence <= memory.watermark || memory.recent.some(e => e.eventId === event.eventId)) return false;
  memory.watermark = event.sequence;
  memory.recent.push({ ...event, audience: [...event.audience], evidenceIds: [...event.evidenceIds] });
  if (memory.recent.length > AGENCY_V1.recentLimit) memory.recent.splice(0, memory.recent.length - AGENCY_V1.recentLimit);
  return true;
}
export function validMemory(value: unknown): value is MemoryState {
  if (!value || typeof value !== 'object') return false;
  const m = value as MemoryState;
  return Object.keys(m).every(k => ['watermark', 'recent'].includes(k)) && Number.isSafeInteger(m.watermark) && m.watermark >= 0
    && Array.isArray(m.recent) && m.recent.length <= AGENCY_V1.recentLimit && m.recent.every((e, i) => validExperience(e)
      && e.sequence <= m.watermark && (!i || e.sequence > m.recent[i - 1].sequence));
}
