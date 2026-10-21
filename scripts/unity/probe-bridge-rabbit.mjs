import fs from 'node:fs';
import {tsImport} from 'tsx/esm/api';
process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const {newWorldTraverse}=await tsImport('../../src/games/camp/world/newWorldProfile.ts',import.meta.url);
const {createAnimalWorld,executeAnimalAction,distance}=await tsImport('../../src/games/camp/animals/engine.ts',import.meta.url);
const a={x:70.0373554,y:-7.9547272},b={x:89.374176,y:-23.21243};
const length=distance(a,b),dx=(b.x-a.x)/length,dy=(b.y-a.y)/length;
const at=(s,l)=>({x:a.x+dx*s-dy*l,y:a.y+dy*s+dx*l});
const rows=[];
for(const side of [-2,-1.5,-.75,0,.75,1.5,2]){
 const start=at(-1,side),target=at(length+2,0),world=createAnimalWorld(22,[start],[target]),rabbit=world.animals[0];
 for(let tick=0;tick<900&&distance(rabbit.position,target)>.25;tick++){world.time=tick*.1;executeAnimalAction(world,rabbit,{action:'explore',target,targetId:null},.1,(a,b)=>newWorldTraverse(a,b,true));}
 rows.push({side,start,end:rabbit.position,remaining:distance(rabbit.position,target),reached:distance(rabbit.position,target)<.25});
}
fs.writeFileSync('native/Artifacts/bridge-river/rabbit-probe.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows));
if(rows.some(r=>!r.reached))process.exitCode=1;
