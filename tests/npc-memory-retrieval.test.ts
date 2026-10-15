import { expect, it } from 'vitest';
import { retrieveMemories, summarizeMemories } from '../packages/npc-core/src/memory-retrieval';
import type { Experience } from '../packages/npc-core/src';
const e = (sequence: number, fact: string, salience: number): Experience => ({ eventId: `e${sequence}`, sequence, at: sequence, npcId: 'a', category: 'social', actorId: 'player', audience: ['a'], fact, interpretation: '', evidenceIds: [], source: 'experienced', salience });
it('retrieves relevant important old experiences before irrelevant new chatter', () => {
  const events = [e(1,'休息诉求第三次被拒绝。',1),e(80,'今天的云很白。',.1)];
  expect(retrieveMemories(events, { npcId:'a', now:100, query:'休息诉求', limit:1 })[0].sequence).toBe(1);
  expect(retrieveMemories(events, { npcId:'b', now:100, query:'休息', limit:12 })).toEqual([]);
  const summary = summarizeMemories('a',events);
  expect(summary.evidenceIds).toContain('e1'); expect(summary.text).toContain('拒绝');
});
