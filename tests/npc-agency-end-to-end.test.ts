import { expect, it } from 'vitest';
import { evaluateIntent } from '../scripts/evaluate-agency';
import { advanceGameSteps, createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency, remember, agencyPerson } from '../src/games/camp/npc/experience';
import { ensureCampMind } from '../src/games/camp/npc/bridge';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { updateCollectives, replyCollective } from '../src/games/camp/npc/collectives';
it('personality changes intent distributions and denial raises protest compared with ordinary conditions',()=>{
  const angry=evaluateIntent('linlan',3,80),normal=evaluateIntent('linlan',0,80),patient=evaluateIntent('tiesheng',3,80);
  const protest=(x:Record<string,number>)=>(x.refuse??0)+(x.recruit??0)+(x.strike??0);
  expect(protest(angry)).toBeGreaterThan(protest(normal));expect(angry).not.toEqual(patient);
});
it('integrates collective recovery with actual simulation and records the resulting experiences',()=>{
  const s=createGame({seed:55});s.status='playing';ensureAgency(s);const n=s.npcs[3];n.energy=30;n.hunger=10;s.food=60;
  const m=ensureCampMind(n);m.intent={kind:'refuse',since:0,until:20,actionId:'rest',reason:'多次休息诉求被拒绝。'};
  m.concerns=[{id:1,kind:'rest',status:'open',openedAt:0,updatedAt:0,resolvedAt:null,denials:3,severity:.8}];m.nextConcernId=2;
  remember(s,n.id,'social','休息诉求被领主多次拒绝。','player',[n.id],'experienced','',1);
  updateCollectives(s);const group=s.agency!.groups.find(g=>g.initiator===n.id)!;replyCollective(s,group.id,'rest');
  const recovered=advanceGameSteps(s,400,baselinePolicy),actual=recovered.npcs.find(p=>p.id===n.id)!;
  expect(actual.energy).toBeGreaterThan(60);expect(recovered.agency!.groups.find(g=>g.id===group.id)!.stage).toBe('ended');
  expect(agencyPerson(recovered,n.id).memory.recent.some(e=>e.category==='action')).toBe(true);
},20000);
