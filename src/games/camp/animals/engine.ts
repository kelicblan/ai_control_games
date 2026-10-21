/** Camera independent, deterministic animal authority. Positions use the shared logical world. */
import {tideMember,animalHostile,type Tide} from './tide';
import {migratePopulation,stepPopulation,type AnimalLife,type Population} from './population';
import {steerStep,type SteeringMemory} from '../../../../packages/world-core/src/steering';
export interface Point{x:number;y:number}
export const SPECIES={
 rabbit:{hp:22,speed:3.8,attack:2,defense:0,food:12,prey:[] as string[],sense:18},
 pheasant:{hp:18,speed:3.4,attack:2,defense:0,food:10,prey:[] as string[],sense:16},
 deer:{hp:65,speed:4.8,attack:12,defense:3,food:28,prey:[] as string[],sense:24},
 boar:{hp:85,speed:3.3,attack:17,defense:8,food:35,prey:['rabbit','pheasant'],sense:18},
 bear:{hp:180,speed:3.2,attack:28,defense:12,food:70,prey:['rabbit','pheasant','deer'],sense:22},
 tiger:{hp:135,speed:4.6,attack:30,defense:7,food:60,prey:['rabbit','pheasant','deer','boar'],sense:26},
} as const;
export type Species=keyof typeof SPECIES;
export const ACTIONS=['rest','explore','forage','eat','drink','seekWater','flee','stalk','chase','attack','home','guard'] as const;
export type Action=typeof ACTIONS[number];
export interface Candidate{action:Action;target:Point;targetId:string|null}
export interface Animal{ id:string;species:Species;home:Point;position:Point;heading:number;hp:number;hunger:number;thirst:number;energy:number;mode:Action|'dead';cooldown:number;alertUntil:number;attacker:string|null;intent:Candidate|null;nextDecision:number;carcass:number;deathAt:number|null;source:'teacher'|'mlp';blocked:number;steering?:SteeringMemory;life?:AnimalLife }
export interface Human{kind?:'human'|'gate'|'fence';id:string;position:Point;hp:number;attack:number;defense:number;range:number}
export interface Patch{id:string;position:Point;remaining:number;capacity:number;readyAt:number}
export interface AnimalWorld{tide?:Tide;population?:Population;version:1;seed:number;time:number;animals:Animal[];food:Patch[];water:Patch[];events:{id:number;at:number;kind:string;actor:string;target:string|null;amount:number}[];sequence:number;metrics:{decisions:number;mlp:number;blocked:number;grazed:number;drank:number;predation:number;escapes:number;starved:number}}
export interface Observation{head:'life'|'combat';state:number[];candidates:(Candidate&{features:number[]})[]}
export type Decide=(o:Observation,animal:Animal)=>Candidate;
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function random(seed:number,index:number){let n=(seed^Math.imul(index+1,0x9e3779b9))>>>0;n^=n>>>16;n=Math.imul(n,0x21f0aaad);n^=n>>>15;return (n>>>0)/4294967296;}
function event(w:AnimalWorld,kind:string,a:string,target:string|null,amount=0){w.events.push({id:++w.sequence,at:w.time,kind,actor:a,target,amount});if(w.events.length>128)w.events.shift();}
export function createAnimalWorld(seed:number,habitats:readonly Point[],water:readonly Point[]=habitats):AnimalWorld{
 if(!habitats.length||!water.length||![...habitats,...water].every(p=>Number.isFinite(p.x+p.y)))throw new Error('Animal habitat required');
 const animals:Animal[]=[];let i=0;
 for(const species of Object.keys(SPECIES) as Species[])for(let n=0;n<({rabbit:6,pheasant:5,deer:4,boar:3,bear:2,tiger:2})[species];n++){
  const home={...habitats[i%habitats.length]};animals.push({id:`animal-${species}-${n}`,species,home,position:{...home},heading:random(seed,i)*Math.PI*2,hp:SPECIES[species].hp,hunger:20+random(seed,i+100)*30,thirst:15+random(seed,i+200)*20,energy:85,mode:'rest',cooldown:0,alertUntil:0,attacker:null,intent:null,nextDecision:i++*.04,carcass:0,deathAt:null,source:'teacher',blocked:0});
 }
 const patches=(points:readonly Point[],prefix:string,capacity:number)=>points.map((p,i)=>({id:`${prefix}-${i}`,position:{...p},remaining:capacity,capacity,readyAt:0}));
 return {version:1,seed,time:0,animals,food:patches(habitats,'forage',40),water:patches(water,'water',160),events:[],sequence:0,metrics:{decisions:0,mlp:0,blocked:0,grazed:0,drank:0,predation:0,escapes:0,starved:0}};
}
export function animalObservation(w:AnimalWorld,a:Animal,humans:readonly Human[],visible:(a:Point,b:Point)=>boolean=()=>true):Observation{
 const s=SPECIES[a.species],near=w.animals.filter(b=>b.id!==a.id&&distance(a.position,b.position)<=s.sense&&visible(a.position,b.position));
 const people=humans.filter(h=>h.kind!=='gate'&&h.kind!=='fence'&&h.hp>0&&distance(a.position,h.position)<=s.sense&&visible(a.position,h.position));
 const threats=[...near.filter(b=>b.hp>0&&(SPECIES[b.species].prey as readonly string[]).includes(a.species)),...people].sort((b,c)=>distance(a.position,b.position)-distance(a.position,c.position));
 const threat=threats[0];const prey=near.filter(b=>b.hp>0&&(s.prey as readonly string[]).includes(b.species)).sort((b,c)=>distance(a.position,b.position)-distance(a.position,c.position))[0];
 const food=w.food.filter(p=>p.remaining>0&&distance(a.position,p.position)<=s.sense&&visible(a.position,p.position)).sort((b,c)=>distance(a.position,b.position)-distance(a.position,c.position))[0];
 const corpse=near.filter(b=>b.hp<=0&&b.carcass>0&&(s.prey as readonly string[]).length>0).sort((b,c)=>distance(a.position,b.position)-distance(a.position,c.position))[0];
 const water=w.water.filter(p=>p.remaining>0&&distance(a.position,p.position)<=s.sense&&visible(a.position,p.position)).sort((b,c)=>distance(a.position,b.position)-distance(a.position,c.position))[0];
 const retaliate=!!threat&&a.attacker===threat.id&&a.alertUntil>w.time;
 const state=[...Object.keys(SPECIES).map(k=>Number(k===a.species)),a.hunger/100,a.thirst/100,a.energy/100,a.hp/s.hp,threat?distance(a.position,threat.position)/s.sense:1,prey?distance(a.position,prey.position)/s.sense:1,food||corpse?Math.min(distance(a.position,(corpse??food)!.position)/s.sense,1):1,water?distance(a.position,water.position)/s.sense:1,Number(retaliate),clamp(distance(a.position,a.home)/40),tideMember(w,a)?(['gathering','approaching','attacking','retreating'].indexOf(w.tide!.phase)+1)/4:0,Number(tideMember(w,a)),Number((a.life?.matureAt??0)>w.time),Number(people.some(h=>animalHostile(w,a,h.id)))];
 const list:Candidate[]=[{action:'rest',target:a.position,targetId:null},{action:'guard',target:a.position,targetId:null},{action:'home',target:a.home,targetId:null}];
 const angle=random(w.seed,Math.floor(w.time/8)+w.animals.indexOf(a)*173)*Math.PI*2+Math.min(a.blocked,8)*.7;
 list.push({action:'explore',target:{x:a.position.x+Math.cos(angle)*7,y:a.position.y+Math.sin(angle)*7},targetId:null});
 if(food&&a.species!=='tiger')list.push({action:distance(a.position,food.position)<=1?'eat':'forage',target:food.position,targetId:food.id});
 if(corpse)list.push({action:distance(a.position,corpse.position)<=1?'eat':'forage',target:corpse.position,targetId:corpse.id});
 if(water)list.push({action:distance(a.position,water.position)<=1?'drink':'seekWater',target:water.position,targetId:water.id});
 if(threat){const d=Math.max(.01,distance(a.position,threat.position));const dx=d<=.01?Math.cos(angle):(a.position.x-threat.position.x)/d;const dy=d<=.01?Math.sin(angle):(a.position.y-threat.position.y)/d;list.push({action:'flee',target:{x:a.position.x+dx*8,y:a.position.y+dy*8},targetId:threat.id});if(retaliate&&s.attack>=10&&d<=1.7)list.push({action:'attack',target:threat.position,targetId:threat.id});}
 const huntHuman=people.filter(h=>animalHostile(w,a,h.id)).sort((b,c)=>distance(a.position,b.position)-distance(a.position,c.position))[0];
 if(huntHuman)list.push({action:distance(a.position,huntHuman.position)<=1.7?'attack':'chase',target:huntHuman.position,targetId:huntHuman.id});
 if(tideMember(w,a)){
  const t=w.tide!;if(t.phase==='gathering'||t.phase==='approaching')list.push({action:'chase',target:t.phase==='gathering'?t.gather:t.target,targetId:'tide:'+t.phase});
  if(t.phase==='attacking'){const wall=humans.find(h=>h.kind==='gate'&&h.hp>0);if(wall)list.push({action:distance(a.position,wall.position)<=1.7?'attack':'chase',target:wall.position,targetId:wall.id});else list.push({action:'chase',target:t.target,targetId:'tide:attack'});}
  if(t.phase==='retreating')list.push({action:'flee',target:a.home,targetId:'tide:retreat'});
 }
 if(prey)list.push({action:distance(a.position,prey.position)<=1.7?'attack':distance(a.position,prey.position)<6?'chase':'stalk',target:prey.position,targetId:prey.id});
 return {head:threat||prey&&a.hunger>45?'combat':'life',state,candidates:list.map(c=>({...c,target:{...c.target},features:[...ACTIONS.map(k=>Number(k===c.action)),clamp(distance(a.position,c.target)/s.sense),c.targetId?clamp((near.find(b=>b.id===c.targetId)?.hp??0)/180):0,threat?clamp(distance(c.target,threat.position)/s.sense):1,Number(c.action==='eat'||c.action==='drink'||c.action==='attack')]}))};
}
export function teacherAction(o:Observation):Candidate{
 const mission=o.state[16];const h=o.state[6],t=o.state[7],e=o.state[8],hp=o.state[9],danger=o.state[10],retaliate=o.state[14];
 const score=(c:Candidate)=>{if(c.targetId==='tide:retreat')return 30;if(c.targetId?.startsWith('tide:'))return 22;if(mission===.75&&(c.action==='attack'||c.action==='chase')&&c.targetId&&(c.targetId==='structure:gate'||!c.targetId.startsWith('animal-')))return hp>.2?25:2;if(o.state[19]&&hp>.5&&(c.action==='attack'||c.action==='chase')&&c.targetId&&!c.targetId.startsWith('animal-'))return 15;switch(c.action){case'flee':return danger<.5?9+(1-hp)*3:2;case'attack':return retaliate&&hp>.5?11: h>.45?5+h*4:0;case'chase':case'stalk':return h>.45&&e>.25?3+h*4:0;case'drink':case'seekWater':return t>.45?2+t*6:0;case'eat':case'forage':return h>.4?2+h*6:0;case'rest':return e<.55?3+(1-e)*5: .3;case'home':return o.state[15]>.6?2:0;case'explore':return 1.2;case'guard':return .1;}};
 return [...o.candidates].sort((a,b)=>score(b)-score(a))[0];
}
export function hurtAnimal(w:AnimalWorld,a:Animal,damage:number,attacker:string){if(a.hp<=0)return;a.hp=Math.max(0,a.hp-Math.max(0,damage));a.attacker=attacker;a.alertUntil=w.time+15;a.nextDecision=w.time;event(w,'animal.hit',attacker,a.id,damage);if(a.hp===0){if(w.population)w.population.deaths++;a.mode='dead';a.intent=null;a.deathAt=w.time;a.carcass=SPECIES[a.species].food;event(w,'animal.died',attacker,a.id,a.carcass);}}
/** Execution validates distance/cooldown and consumes finite resources; policy cannot author state. */
export function executeAnimalAction(w:AnimalWorld,a:Animal,c:Candidate,dt:number,canMove:(a:Point,b:Point)=>boolean,humans:readonly Human[]=[],hitHuman?:(id:string,damage:number,attacker:string)=>void,physicalMove?:(animal:Animal,from:Point,to:Point)=>boolean){
 if(a.hp<=0)return;const s=SPECIES[a.species];a.mode=c.action;
 if(tideMember(w,a)&&w.tide!.phase==='retreating'&&['attack','chase','stalk'].includes(c.action)&&humans.some(h=>h.id===c.targetId)&&!(a.attacker===c.targetId&&a.alertUntil>w.time))return;
 if(c.action==='rest'){a.energy=Math.min(100,a.energy+dt*5);return;}
 if(c.action==='guard')return;
 if(c.action==='eat'||c.action==='drink'){
  const p=(c.action==='drink'?w.water:w.food).find(p=>p.id===c.targetId);const corpse=w.animals.find(b=>b.id===c.targetId&&b.hp<=0&&b.carcass>0);
  if(p&&p.remaining>0&&distance(a.position,p.position)<=1&&(c.action==='drink'||a.species!=='tiger')){const n=Math.min(p.remaining,dt*3);p.remaining-=n;if(!p.remaining)p.readyAt=w.time+180;if(c.action==='drink'){a.thirst=Math.max(0,a.thirst-n*4);w.metrics.drank+=n;}else{a.hunger=Math.max(0,a.hunger-n*4);w.metrics.grazed+=n;}}
  else if(c.action==='eat'&&corpse&&(s.prey as readonly string[]).length&&distance(a.position,corpse.position)<=1){const n=Math.min(corpse.carcass,dt*3);corpse.carcass-=n;a.hunger=Math.max(0,a.hunger-n*5);}
  return;
 }
 if(c.action==='attack'){
  const target=w.animals.find(b=>b.id===c.targetId&&b.hp>0);const human=humans.find(h=>h.id===c.targetId&&h.hp>0);const p=target??human;
  if(!p||distance(a.position,p.position)>1.7||w.time<a.cooldown||!canMove(a.position,p.position))return;
  if(target&&!(s.prey as readonly string[]).includes(target.species)&&a.attacker!==target.id)return;
  if(human&&!(human.kind==='gate'?tideMember(w,a)&&w.tide!.phase==='attacking':animalHostile(w,a,human.id)))return;
  a.cooldown=w.time+1.2;a.energy=Math.max(0,a.energy-2);
  const defense=target?SPECIES[target.species].defense:human!.defense;const damage=Math.max(1,Math.floor(s.attack*(1-Math.min(.7,defense/(defense+50)))));
  if(target){const alive=target.hp>0;hurtAnimal(w,target,damage,a.id);if(alive&&target.hp===0)w.metrics.predation++;}else hitHuman?.(human!.id,damage,a.id);return;
 }
 const target=c.target;
 const d=distance(a.position,target);if(d<.01)return;const speed=s.speed*(c.action==='stalk'?.45:c.action==='flee'||c.action==='chase'?1:.5)*(a.energy<15?.5:1);const step=Math.min(d,dt*speed);
 const p=steerStep(a.position,target,step,w.time,(from,to)=>canMove(from,to)&&(physicalMove?.(a,from,to)??true),a.steering??={side:1,until:0,blocked:0});
 if(p){a.heading=Math.atan2(p.y-a.position.y,p.x-a.position.x);a.position=p;a.energy=Math.max(0,a.energy-dt*(c.action==='flee'||c.action==='chase'?1.2:.25));a.blocked=0;}else{a.blocked++;w.metrics.blocked++;a.nextDecision=w.time;}
}
export function stepAnimals(w:AnimalWorld,humans:readonly Human[],dt:number,canMove:(a:Point,b:Point)=>boolean,decide:Decide=teacherAction,source:'teacher'|'mlp'='teacher',hitHuman?:(id:string,damage:number,attacker:string)=>void,physicalMove?:(animal:Animal,from:Point,to:Point)=>boolean){
 migratePopulation(w);if(dt!==.1)throw new Error('Animal fixed timestep required');w.time=Math.round((w.time+dt)*10)/10;
 for(const p of [...w.food,...w.water])if(p.remaining<=0&&w.time>=p.readyAt)p.remaining=p.capacity;
 for(const a of w.animals){if(a.hp<=0)continue;a.hunger=Math.min(100,a.hunger+dt*.025);a.thirst=Math.min(100,a.thirst+dt*.035);if(a.hunger>=100||a.thirst>=100){hurtAnimal(w,a,dt*.3,'environment');if(a.hp===0)w.metrics.starved++;}
  if(a.hp<=0)continue;if(w.time>=a.nextDecision||!a.intent){const o=animalObservation(w,a,humans,canMove),choice=decide(o,a);const legal=o.candidates.find(c=>c.action===choice.action&&c.targetId===choice.targetId);if(!legal)throw new Error('Animal policy chose illegal candidate');if(a.intent?.action==='flee'&&o.head==='life')w.metrics.escapes++;a.intent={action:legal.action,target:{...legal.target},targetId:legal.targetId};a.source=source;w.metrics.decisions++;if(source==='mlp')w.metrics.mlp++;a.nextDecision=w.time+1;}
  executeAnimalAction(w,a,a.intent,dt,canMove,humans,hitHuman,physicalMove);
 }
 stepPopulation(w,canMove);
}
