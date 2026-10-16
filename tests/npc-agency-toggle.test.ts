import { expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { agencyPerson, ensureAgency } from '../src/games/camp/npc/experience';
import { decideCampBehavior, ensureCampMind } from '../src/games/camp/npc/bridge';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { getObservation } from '../src/games/camp/simulation/observation';
it('disabled agency retains grievances but does not apply strike execution overrides',()=>{
  const s=createGame();ensureAgency(s).enabled=false;const n=s.npcs[0];s.food=30;n.energy=80;n.hunger=10;
  const m=ensureCampMind(n);m.intent={kind:'strike',since:0,until:30,actionId:'rest',reason:'未解决分工'};
  m.concerns=[{id:1,kind:'rest',status:'open',openedAt:0,updatedAt:0,resolvedAt:null,denials:3,severity:.9}];m.nextConcernId=2;
  const baseline={...baselinePolicy(getObservation(s,n)),action:'wood' as const};
  const r=decideCampBehavior(s,n,baseline,['wood','rest','eat']);
  expect(r.result.action).toBe('wood');expect(m.concerns[0].denials).toBe(3);expect(agencyPerson(s,n.id).invitation).toBeNull();
});
