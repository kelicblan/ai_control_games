import { expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency } from '../src/games/camp/npc/experience';
import { decideCampBehavior, ensureCampMind } from '../src/games/camp/npc/bridge';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { getObservation } from '../src/games/camp/simulation/observation';
it('does not conscript a striker to fix shared stock and preserves protest while eating', () => {
  const s=createGame();ensureAgency(s);s.food=0;
  const n=s.npcs[0];n.energy=80;n.hunger=20;
  const m=ensureCampMind(n);m.intent={kind:'strike',since:0,until:30,actionId:'rest',reason:'要求调整分工'};
  const result=decideCampBehavior(s,n,baselinePolicy(getObservation(s,n)),['food','wood','rest','camp']);
  expect(result.result.action).toBe('rest');
  n.hunger=96;s.food=20;
  const eat=decideCampBehavior(s,n,baselinePolicy(getObservation(s,n)),['eat','food','rest']);
  expect(eat.result.action).toBe('eat');expect(n.mind!.intent.kind).toBe('strike');
});
