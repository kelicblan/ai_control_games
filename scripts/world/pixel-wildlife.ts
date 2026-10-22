// @ts-expect-error Shared authoritative map geometry.
import {terrainAt,isBlocked,VILLAGE} from '../../src/games/camp/world/pixel/world.mjs';
import {random,createAnimalWorld,type Animal,type Point,type Species} from '../../src/games/camp/animals/engine';
import type {WildlifeAuthority} from '../../src/games/camp/animals/authority';
import {validateWildlife} from '../../src/games/camp/animals/validation';
declare module '../../src/games/camp/animals/engine'{interface Animal{region?:string}}
declare module '../../src/games/camp/animals/authority'{interface WildlifeAuthority{pixelRegions?:PixelRegions}}
export const CELL=128,MAX_ACTIVE_REGIONS=20;
export interface PixelRegions{version:1;active:string[];dormant:Record<string,Animal[]>}
export interface RegionStore{read(id:string):Animal[]|undefined;write(id:string,animals:Animal[]):void}
const templates=new Map<string,Animal[]>();
const hash=(seed:number,x:number,y:number)=>seed^Math.imul(x+1,73856093)^Math.imul(y+1,19349663);
export function regionalGroup(seed:number,cx:number,cy:number,time=0):Animal[]{
 if(cx<0||cy<0||cx>=250||cy>=250)return [];
 const cacheKey=`${seed}:${cx}:${cy}`;let animals=templates.get(cacheKey);
 if(!animals){animals=[];const salt=hash(seed,cx,cy);
 for(let i=0;i<5;i++){
  let home:Point|null=null;
  for(let n=0;n<12;n++){
   const p={x:cx*CELL+8+random(salt,i*50+n*2)*112,y:cy*CELL+8+random(salt,i*50+n*2+1)*112};
   if(Math.abs(p.x-VILLAGE.x)<105&&Math.abs(p.y-VILLAGE.y)<95)continue;
   if(!isBlocked(p.x,p.y,{gateOpen:true})&&!['path','sand','bridge'].includes(terrainAt(p.x,p.y).kind)){home=p;break;}
  }
  if(!home)continue;
  const terrain=terrainAt(home.x,home.y).kind,r=random(salt,i+900),near=Math.hypot(home.x-VILLAGE.x,home.y-VILLAGE.y)<700;
  const species:Species=r<.4?'rabbit':r<.65?'pheasant':r<.86?'deer':r<.96||near?'boar':terrain==='hill'?'bear':'tiger';
  const chosen=near&&species==='boar'?'deer':species;
  const template=createAnimalWorld(salt,[home]).animals.find(a=>a.species===chosen)!;
  animals.push({...template,id:`regional-${cx}-${cy}-${i}`,region:`${cx},${cy}`,home,position:{...home}});
 }
 if(templates.size>=256)templates.delete(templates.keys().next().value!);templates.set(cacheKey,animals);
 }
 return animals.map(template=>{const a=structuredClone(template);a.nextDecision=time;a.life={bornAt:0,matureAt:0,nextBreedAt:time+720,parents:[]};a.position=coarsePosition(a,time);return a;});
}
function coarsePosition(a:Animal,time:number):Point{
 if(a.hp<=0)return {...a.position};
 const phase=random(hash(0,Math.floor(a.home.x),Math.floor(a.home.y)),1)*6.28;
 const q={x:a.home.x+Math.sin(time*.11+phase)*2.5,y:a.home.y+Math.cos(time*.09+phase)*2.5};
 return !isBlocked(q.x,q.y,{gateOpen:true})?q:{...a.home};
}
export function activateRegionalWildlife(v:WildlifeAuthority,people:Point[],store?:RegionStore){
 const regions=v.pixelRegions??={version:1,active:[],dormant:{}};
 const validKey=(k:string)=>/^\d{1,3},\d{1,3}$/.test(k)&&k.split(',').every(n=>Number(n)<250);
 if(regions.version!==1||!Array.isArray(regions.active)||regions.active.length>20||new Set(regions.active).size!==regions.active.length||!regions.active.every(validKey)||!regions.dormant||Object.keys(regions.dormant).length>62500)throw Error('Invalid regional wildlife');
 for(const [id,animals] of Object.entries(regions.dormant)){if(!validKey(id)||regions.active.includes(id)||!Array.isArray(animals)||animals.some(a=>a.region!==id))throw Error('Invalid dormant region');validateWildlife({ecology:{...v.ecology,animals},hunt:null,operations:{}});}
 const candidates=new Set<string>();for(const p of people)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
  const cx=Math.floor(p.x/CELL)+x,cy=Math.floor(p.y/CELL)+y;if(cx>=0&&cy>=0&&cx<250&&cy<250)candidates.add(`${cx},${cy}`);
 }
 const near=(k:string)=>{const [x,y]=k.split(',').map(Number);return Math.min(...people.map(p=>Math.hypot(p.x-(x+.5)*CELL,p.y-(y+.5)*CELL)));};
 const desired=[...candidates].sort((a,b)=>near(a)-near(b)).slice(0,MAX_ACTIVE_REGIONS).sort();
 if(desired.join('|')===regions.active.join('|'))return;
 for(const id of regions.active)regions.dormant[id]=v.ecology.animals.filter(a=>a.region===id);
 if(store)for(const [id,animals] of Object.entries(regions.dormant))store.write(id,animals);
 const retained=v.ecology.animals.filter(a=>!a.region),activated:string[]=[];
 for(const id of desired){const [x,y]=id.split(',').map(Number);const saved=regions.dormant[id]??store?.read(id);const group=saved??regionalGroup(v.ecology.seed,x,y,v.ecology.time);if(retained.length+group.length>210)continue;
  for(const a of group){a.nextDecision=v.ecology.time;a.intent=null;if(saved&&a.hp>0)a.position=coarsePosition(a,v.ecology.time);}retained.push(...group);activated.push(id);delete regions.dormant[id];}
 regions.active=activated;v.ecology.animals=retained;
 if(store)regions.dormant={};
 v.ecology.food=v.ecology.food.filter(p=>!p.id.startsWith('regional-food-'));
 for(const id of activated){const group=retained.filter(a=>a.region===id);for(const a of group)v.ecology.food.push({id:`regional-food-${a.id}`,position:{...a.home},remaining:40,capacity:40,readyAt:0});}
}
export function observeRegionalWildlife(v:WildlifeAuthority,center:Point,span:number,store?:RegionStore){
 const radius=Math.min(300,Math.max(8,span/2)),result:Animal[]=[];
 const minX=Math.max(0,Math.floor((center.x-radius)/CELL)),maxX=Math.min(249,Math.floor((center.x+radius)/CELL));
 const minY=Math.max(0,Math.floor((center.y-radius)/CELL)),maxY=Math.min(249,Math.floor((center.y+radius)/CELL));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
  const id=`${x},${y}`,active=v.pixelRegions?.active.includes(id);
  const animals=active?v.ecology.animals.filter(a=>a.region===id):v.pixelRegions?.dormant[id]??store?.read(id)??regionalGroup(v.ecology.seed,x,y,v.ecology.time);
  for(const a of animals){const p=active?a.position:coarsePosition(a,v.ecology.time);if(Math.abs(p.x-center.x)<=radius&&Math.abs(p.y-center.y)<=radius&&(a.hp>0||a.carcass>0))result.push({...a,position:p});}
 }
 for(const a of v.ecology.animals)if(!a.region&&Math.abs(a.position.x-center.x)<=radius&&Math.abs(a.position.y-center.y)<=radius)result.push(a);
 return result.slice(0,220);
}
