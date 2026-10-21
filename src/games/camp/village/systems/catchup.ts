import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { VillageState } from '../domain/types';
import { selectWorldRules } from '../config/load';
import { dueVillageWaves } from '../domain/clock';
import { supplement } from './resources';
import { advanceVillage } from './advance';
/** Logical idle replay only. Autonomous policy/LLM schedulers must supply their own next wake boundary. */
export function advanceIdleVillage(state:VillageState,ticks:number,onStep?:(state:VillageState)=>void){
 ensure(Number.isSafeInteger(ticks)&&ticks>=0,'Invalid catchup horizon');
 const end=state.tick+ticks,rules=selectWorldRules('village-v1',state.ruleVersion),cycle=Math.round((rules.clock.daylightSeconds+rules.clock.nightSeconds)*10);let skippedTicks=0,steppedTicks=0;
 if(state.paused)return{skippedTicks,steppedTicks};
 while(state.tick<end){
  const work=Object.values(state.executions).some(e=>['accepted','running'].includes(e.status));
  const combat=Object.values(state.combat?.enemies??{}).some(e=>e.hp>0)&&Object.values(state.actors).some(a=>a.body.hp>0);
  const plans=Object.values(state.social.agreements).some(a=>!['fulfilled','cancelled','breached'].includes(a.status));
  if(!work&&!combat&&!plans){
   const boundaries=[end+1,(Math.floor((state.tick-1)/cycle)+1)*cycle+1];
   if(state.economy?.foodSources){const supply=supplement<{foodSupply:{refillSeconds:number}}>(rules,'D12').foodSupply;const period=Math.round(supply.refillSeconds*10);boundaries.push((Math.floor(state.tick/period)+1)*period);}
   if(state.combat){
    const waves=dueVillageWaves(state.elapsed,end*.1,rules,Object.keys(state.combat.waves).map(Number));if(waves.length)boundaries.push(Math.round(waves[0].atSeconds*10));
    const timeout=supplement<{downedSeconds:number}>(rules,'D16').downedSeconds;
    for(const [id,at]of Object.entries(state.combat.downedAt))if(!state.actors[id].body.incapacitated)boundaries.push(Math.ceil((at+timeout)*10));
   }
   for(const rule of Object.values(state.institutions??{}))if(rule.expiresAt>state.elapsed)boundaries.push(Math.ceil(rule.expiresAt*10));
   const next=Math.min(...boundaries.filter(t=>t>state.tick)),skip=Math.max(0,Math.min(end-state.tick,next-state.tick-1));
   state.tick+=skip;state.elapsed=state.tick*.1;state.revision+=skip;skippedTicks+=skip;
  }
  if(state.tick<end){advanceVillage(state);onStep?.(state);steppedTicks++;}
 }
 return{skippedTicks,steppedTicks};
}
