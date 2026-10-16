import { coordinateRandom } from '../../../../packages/world-core/src';
import type { GameState, Point } from '../simulation/types';
import { insideSettlement } from './settlement';
import { worldCanTraverse } from './navigation';
import { ensureEcology, type Animal, ANIMAL_NAMES } from './ecology';

const gap=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const maxHealth=(a:Animal)=>a.species==='tiger'?100:a.species==='boar'?60:20;
/** Fixed ecology ticks are saved, independent of display frames and camera position. */
export function updateEcology(state:GameState):void {
  const ecology=ensureEcology(state);
  // Public transitions also accept handcrafted in-memory fixtures; never loop over an arbitrary clock gap.
  // Persisted worlds reject this inconsistency in the decoder; normal offline recovery replays engine steps.
  if(state.elapsed-ecology.updatedAt>1)ecology.updatedAt=state.elapsed-.5;
  for(const r of ecology.resources){
    if(r.remaining<r.capacity&&state.elapsed>=r.readyAt){r.remaining=r.capacity;r.readyAt=0;}
    if(!r.discovered&&[...state.npcs.filter(n=>n.alive),...(state.lord?[state.lord]:[])].some(n=>gap(n.position,r.position)<70))r.discovered=true;
  }
  while(ecology.updatedAt+.5<=state.elapsed+1e-9){
    ecology.updatedAt=Math.round((ecology.updatedAt+.5)*1000)/1000;
    const now=ecology.updatedAt,tick=Math.floor(now*2);
    for(let i=0;i<ecology.animals.length;i++){
      const a=ecology.animals[i];
      if(a.health===0){
        if(now>=a.respawnAt&&!state.npcs.some(n=>n.alive&&gap(n.position,a.home)<70)&&(!state.lord||gap(state.lord.position,a.home)>70)){
          a.position={...a.home};a.health=maxHealth(a);a.mode='graze';a.alertUntil=0;a.nextTurn=now+2;
        }continue;
      }
      const people=[...state.npcs.filter(n=>n.alive),...(state.lord?[state.lord]:[])];
      const nearest=people.reduce<(typeof people)[number]|undefined>((best,n)=>!best||gap(n.position,a.position)<gap(best.position,a.position)?n:best,undefined);
      const proximity=nearest?gap(nearest.position,a.position):Infinity;
      const urgent=proximity<90;
      if(!urgent&&tick%8!==i%8)continue;
      const dt=urgent?.5:4;
      const hunted=state.npcs.some(n=>n.alive&&n.wildTask?.kind==='hunt'&&n.wildTask.targetId===a.id&&n.wildTask.phase!=='return');
      let speed=a.species==='rabbit'?1.2:a.species==='pheasant'?.9:a.species==='boar'?1.1:1.5;
      if(nearest&&((a.species==='tiger'&&proximity<38)||(a.species==='boar'&&proximity<14&&(hunted||a.health<maxHealth(a)||proximity<7)))){
        a.mode='charge';a.heading=Math.atan2(nearest.position.y-a.position.y,nearest.position.x-a.position.x);speed=a.species==='tiger'?10:8;
        if(proximity<4&&now>=a.attackAt){
          a.attackAt=now+5;
          // The lord has no survival health in the current game. Never invent a separate damage model here.
          if('health' in nearest){nearest.health=Math.max(0,nearest.health-(a.species==='tiger'?18:8)*(state.difficulty==='cozy'?.65:1));nearest.fear=Math.min(100,nearest.fear+20);nearest.injured=true;
            nearest.speech=`${ANIMAL_NAMES[a.species]}冲过来了，快撤！`;nearest.speechUntil=state.elapsed+5;
          }
        }
      }else if(nearest&&(proximity<(hunted?34:22))&&(a.species==='rabbit'||a.species==='pheasant'||a.species==='boar')){
        a.mode='flee';a.alertUntil=now+3;a.heading=Math.atan2(a.position.y-nearest.position.y,a.position.x-nearest.position.x);
        speed=a.species==='rabbit'?5.2:a.species==='pheasant'?5.6:4;
      }else if(now>=a.nextTurn||a.mode==='charge'||a.mode==='flee'&&now>=a.alertUntil){
        const random=coordinateRandom(i,Math.floor(now/3),state.seed^991);
        a.mode=random<.3?'idle':'graze';a.heading=random*Math.PI*2-Math.PI;a.nextTurn=now+3+random*7;
      }
      if(a.mode==='idle')continue;
      if(a.mode==='graze'&&gap(a.position,a.home)>35)a.heading=Math.atan2(a.home.y-a.position.y,a.home.x-a.position.x);
      const target={x:a.position.x+Math.cos(a.heading)*speed*dt,y:a.position.y+Math.sin(a.heading)*speed*dt};
      if((a.mode==='charge'||!insideSettlement(target.x,target.y,12))&&worldCanTraverse(a.position,target,state.seed,state.world?.gateOpen??true))a.position=target;
      else {a.heading=Math.atan2(a.home.y-a.position.y,a.home.x-a.position.x);a.nextTurn=now;}
    }
  }
}
