import fs from 'node:fs';
import {tsImport} from 'tsx/esm/api';
import {local,inTerrain,logical,setRiverBoundary} from './forest-expansion.mjs';
setRiverBoundary(JSON.parse(fs.readFileSync('native/ArtSource/forest-expansion/original-river.json','utf8')));
process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const {newWorld,newWorldRoute,newWorldTraverse,newWorldWalkable}=await tsImport('../../src/games/camp/world/newWorldProfile.ts',import.meta.url);
const {wildernessSites}=await tsImport('../../src/games/camp/world/wildernessSites.ts',import.meta.url);
const {createAnimalWorld,stepAnimals}=await tsImport('../../src/games/camp/animals/engine.ts',import.meta.url);
const {zoneForestAnimals}=await tsImport('../../src/games/camp/world/forestExpansion.ts',import.meta.url);
const {insideSettlement}=await tsImport('../../src/games/camp/world/settlement.ts',import.meta.url);
const forest=newWorld?.forestExpansion;if(!forest)throw Error('Forest export missing');
const began=performance.now(),checks=[];
const baseline=forest.resourceGrid;if(!baseline)throw Error('Pre-expansion geography missing');let addedCells=0;
for(let i=0;i<newWorld.walkable.length;i++){
  if(!newWorld.walkable[i])continue;const x=newWorld.minX+i%newWorld.width*newWorld.step,y=newWorld.minY+Math.floor(i/newWorld.width)*newWorld.step;
  const [u,v]=local(50-x,y-50);if(!inTerrain(u,v)||insideSettlement(x,y))continue;
  const bx=Math.round((x-baseline.minX)/baseline.step),by=Math.round((y-baseline.minY)/baseline.step);
  if(bx<0||by<0||bx>=baseline.width||by>=baseline.height||baseline.walkable[by*baseline.width+bx]!==1)addedCells++;
}
const addedWalkableArea=addedCells*newWorld.step**2;let villageArea=0;for(let i=0;i<newWorld.outline.length;i++){const a=newWorld.outline[i],b=newWorld.outline[(i+1)%newWorld.outline.length];villageArea+=a.x*b.y-a.y*b.x;}villageArea=Math.abs(villageArea)/2;
if(addedWalkableArea<villageArea*2)throw Error('Net new walkable land is smaller than two villages');
const flanks=[[-180,70],[-185,125],[170,50],[190,95]].map(([u,v],i)=>({id:`southern-flank-${i}`,stand:logical(u,v)}));
for(const site of [...forest.clearings.map(c=>({id:c.id,stand:c.position})),...forest.resources,...flanks]){
  const route=newWorldRoute(newWorld.spawn,site.stand,true);if(!route.length)throw Error(`No authority route to ${site.id}`);
  let last=newWorld.spawn,distance=0;for(const p of route){if(!newWorldTraverse(last,p,true))throw Error(`Illegal route segment ${site.id}`);distance+=Math.hypot(p.x-last.x,p.y-last.y);last=p;}
  if(Math.hypot(last.x-site.stand.x,last.y-site.stand.y)>.01)throw Error(`Partial route to ${site.id}`);
  checks.push({id:site.id,distance,waypoints:route.length});
}
for(const homes of Object.values(forest.habitats))for(const p of homes)if(!newWorldWalkable(p))throw Error('Blocked animal habitat');
if(!forest.drinkingWater?.length)throw Error('No expanded forest drinking water');
for(const p of forest.drinkingWater)if(!newWorldWalkable(p))throw Error('Blocked forest drinking site');
const saved={ecology:createAnimalWorld(17,[newWorld.spawn]),hunt:null,operations:{}};zoneForestAnimals(saved,forest,p=>newWorldWalkable(p),true);
saved.ecology.animals=saved.ecology.animals.filter(a=>a.id==='animal-deer-0'||a.id==='animal-boar-0');for(const a of saved.ecology.animals){a.thirst=95;a.hunger=0;}
for(let i=0;i<6000;i++)stepAnimals(saved.ecology,[],.1,(a,b)=>newWorldTraverse(a,b));
if(saved.ecology.metrics.drank<=10||saved.ecology.animals.some(a=>a.hp<=0||a.thirst>=95))throw Error('Forest deer/boar cannot drink and survive');
const closed=newWorldRoute(newWorld.spawn,forest.clearings[4].position,false);if(closed.length)throw Error('Closed gate bypassed');
const sites=wildernessSites(64138);if(sites.some(s=>s.id.startsWith('forest-')))throw Error('Village expansion polluted legacy ecology geography');
const report={success:true,addedWalkableArea,newAreaRatio:addedWalkableArea/villageArea,checkedRoutes:checks.length,closedGateBlocksForest:true,habitatsAccessible:true,forestDrinkingSites:forest.drinkingWater.length,animalWaterSurvivalSeconds:600,animalWaterConsumed:saved.ecology.metrics.drank,legacyResourceCount:sites.length,forestResourceCount:forest.resources.length,milliseconds:performance.now()-began,routes:checks};
fs.writeFileSync('native/Artifacts/forest-expansion/authority-validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,routes:undefined}));
