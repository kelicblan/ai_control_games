import { performance } from 'node:perf_hooks';
import { advanceGameSteps, createGame } from '../src/games/camp/simulation/engine';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { ensureAgency, agencyPerson } from '../src/games/camp/npc/experience';
import { ensureCampMind, decideCampBehavior } from '../src/games/camp/npc/bridge';
import { getObservation } from '../src/games/camp/simulation/observation';
import type { NpcId } from '../src/games/camp/simulation/types';
export function evaluateIntent(id:NpcId,denials:number,seeds=120){
  const template=createGame();ensureAgency(template);const npc=template.npcs.find(n=>n.id===id)!;npc.energy=45;npc.hunger=20;template.food=60;
  const m=ensureCampMind(npc);m.emotions={anger:.55,resentment:.65,stress:.4};m.intent.until=0;
  if(denials)m.concerns=[{id:1,kind:'rest',status:'open',openedAt:0,updatedAt:0,resolvedAt:null,denials,severity:.8}];m.nextConcernId=2;
  agencyPerson(template,id).knownWork.azhuang={workload:2,at:0};
  const counts:Record<string,number>={};
  for(let seed=1;seed<=seeds;seed++){
    const s=structuredClone(template),n=s.npcs.find(n=>n.id===id)!;n.mind!.randomState=seed*7919;
    const baseline={...baselinePolicy(getObservation(s,n)),latencyMs:0};
    const result=decideCampBehavior(s,n,baseline,['wood','food','eat','rest','camp']);counts[result.decision.intent]=(counts[result.decision.intent]??0)+1;
  }
  return Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v/seeds]));
}
export function benchmarkAgency(){
  const base=createGame({seed:55});base.status='playing';const withMemory=structuredClone(base);ensureAgency(withMemory);
  const timings:{baseline:number[];agency:number[]}={baseline:[],agency:[]};
  // Warm navigation caches before alternating comparable workloads.
  advanceGameSteps(base,20,baselinePolicy);advanceGameSteps(withMemory,20,baselinePolicy);
  for(let i=0;i<12;i++)for(const [key,state]of [['baseline',base],['agency',withMemory]]as const){const t=performance.now();advanceGameSteps(state,20,baselinePolicy);timings[key].push(performance.now()-t);}
  const percentile=(v:number[])=>v.sort((a,b)=>a-b)[Math.floor((v.length-1)*.95)];
  return {baselineP95:percentile(timings.baseline),agencyP95:percentile(timings.agency),snapshotBytes:JSON.stringify(advanceGameSteps(withMemory,20,baselinePolicy)).length};
}
if(process.argv[1]?.endsWith('evaluate-agency.ts'))console.log(JSON.stringify({normal:evaluateIntent('linlan',0),repeatedDenial:evaluateIntent('linlan',3),patient:evaluateIntent('tiesheng',3),benchmark:benchmarkAgency()},null,2));
