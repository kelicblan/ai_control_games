import type{VillageState,Point}from'../../src/games/camp/village/domain/types';
import{advanceWaveSchedule}from'../../src/games/camp/village/systems/waves';
import{repairWorldPosition}from'../../src/games/camp/world/navigation';
import{newWorld}from'../../src/games/camp/world/newWorldProfile';
/** Environment placement only: materialize new enemies before their first engine step. */
export function prepareSharedMapWaves(state:VillageState,map: {spawn:Point;gate:Point}|null=newWorld,project:(point:Point)=>Point=p=>repairWorldPosition(p,state.seed,true)){
 if(!map||state.navigation?.mode!=='shared-world'||!state.combat||(state.tick+1)%7200!==4800)return;
 const before=new Set(Object.keys(state.combat.enemies)),tick=state.tick,elapsed=state.elapsed;
 try{state.tick=tick+1;state.elapsed=state.tick*.1;advanceWaveSchedule(state);}finally{state.tick=tick;state.elapsed=elapsed;}
 const dx=map.gate.x-map.spawn.x,dy=map.gate.y-map.spawn.y,length=Math.max(.001,Math.hypot(dx,dy)),normal={x:dx/length,y:dy/length};let index=0;
 for(const enemy of Object.values(state.combat.enemies))if(!before.has(enemy.id)){
  const row=Math.floor(index/5),column=index%5-2;index++;
  enemy.position=project({x:map.gate.x+normal.x*(12+row*1.2)-normal.y*column*1.2,y:map.gate.y+normal.y*(12+row*1.2)+normal.x*column*1.2});
 }
}
