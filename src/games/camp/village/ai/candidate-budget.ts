import contract from './contract.json';
import type { ActionCandidate,PolicyHead } from '../../../../../packages/policy-runtime/src/types';
/** Stratify the bounded pool; this allocates slots, never chooses an authoritative action. */
export function boundedCandidates(all:ActionCandidate[],head:PolicyHead):ActionCandidate[]{
 const actions:readonly string[]=contract[head].actionIds,limit=contract[head].candidateLimit,index=32+contract.candidateNumeric.findIndex(f=>f.id==='distance_log');
 const groups=new Map(actions.map(action=>[action,all.filter(c=>c.action===action).sort((a,b)=>{const x=a.features[index]<0?Infinity:a.features[index],y=b.features[index]<0?Infinity:b.features[index];return x-y||a.id.localeCompare(b.id);})]));
 const selected:ActionCandidate[]=[];
 for(const action of actions){const group=groups.get(action)!;for(let i=0;i<(action==='CRAFT'?6:1)&&group.length&&selected.length<limit;i++)selected.push(group.shift()!);}
 while(selected.length<limit){let added=false;for(const action of actions){const group=groups.get(action)!;if(group.length&&selected.length<limit){selected.push(group.shift()!);added=true;}}if(!added)break;}
 return selected;
}
