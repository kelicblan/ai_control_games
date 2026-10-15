import { expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency, agencyPerson, validAgency } from '../src/games/camp/npc/experience';
it('rejects malformed groups, appraisal data and unknown peer observations at save boundaries', () => {
  const s=createGame();const a=ensureAgency(s),p=agencyPerson(s,'azhuang');
  expect(validAgency(a,0)).toBe(true);
  a.groups.push({id:1,members:['evil']} as never);expect(validAgency(a,0)).toBe(false);a.groups=[];
  p.knownWork={evil:{workload:1,at:0}} as never;expect(validAgency(a,0)).toBe(false);p.knownWork={};
  p.appraisal={summary:'invented'} as never;expect(validAgency(a,0)).toBe(false);
});
