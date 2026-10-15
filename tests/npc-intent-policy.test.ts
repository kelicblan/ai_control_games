import { expect, it } from 'vitest';
import { sampleIntent } from '../packages/npc-core/src/intent-policy';
it('samples reproducibly after excluding illegal intents', () => {
  const result = sampleIntent(42,{cooperate:1,refuse:2,strike:3},['cooperate','refuse']);
  expect(result).toEqual(sampleIntent(42,{cooperate:1,refuse:2,strike:3},['cooperate','refuse']));
  expect(result.candidates.some(c => c.intent === 'strike')).toBe(false);
  expect(result.candidates.reduce((s,c)=>s+c.probability,0)).toBeCloseTo(1);
  expect(new Set(Array.from({length:80},(_,i)=>sampleIntent((i+1)*7919,{cooperate:1,refuse:2},['cooperate','refuse']).selected)).size).toBe(2);
});
