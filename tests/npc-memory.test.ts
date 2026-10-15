import { expect, it } from 'vitest';
import { appendExperience, createMemory, validExperience } from '../packages/npc-core/src/memory';
import type { Experience } from '../packages/npc-core/src/memory-types';
const event = (sequence: number): Experience => ({ eventId: `e${sequence}`, sequence, at: sequence,
  npcId: 'a', category: 'dialogue', actorId: 'b', audience: ['a', 'b'], fact: '乙说他觉得安排不公。',
  interpretation: '传闻，不是领主偏心的证明。', evidenceIds: [], source: 'heard', salience: .6 });
it('deduplicates by persistent sequence after recent history was trimmed', () => {
  const memory = createMemory();
  for (let i = 1; i <= 80; i++) appendExperience(memory, event(i));
  expect(memory.recent).toHaveLength(48);
  expect(appendExperience(memory, event(1))).toBe(false);
  expect(memory.watermark).toBe(80);
});
it('rejects false audiences and invalid records without altering the working set', () => {
  const memory = createMemory();
  expect(validExperience({ ...event(1), source: 'invented' })).toBe(false);
  expect(appendExperience(memory, { ...event(1), audience: ['b'] })).toBe(false);
  expect(memory.recent).toHaveLength(0);
  expect(appendExperience(memory, event(1))).toBe(true);
  expect(memory.recent[0].source).toBe('heard');
});
