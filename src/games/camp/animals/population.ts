import config from '../../../../config/animals/ecology-v2.json';
import {SPECIES,distance,type AnimalWorld,type Animal,type Point} from './engine';
export {config as ECOLOGY_RULES};
export interface AnimalLife{bornAt:number;matureAt:number;nextBreedAt:number;parents:string[]}
export interface Population{version:2;nextId:number;births:number;deaths:number;lastAt:number}
export function migratePopulation(w:AnimalWorld){
 w.population??={version:2,nextId:1,births:0,deaths:w.animals.filter(a=>a.hp<=0).length,lastAt:w.time};
 for(const a of w.animals)a.life??={bornAt:0,matureAt:w.time,nextBreedAt:w.time+config.species[a.species].breedSeconds,parents:[]};
}
export function stepPopulation(w:AnimalWorld,canMove:(a:Point,b:Point)=>boolean){
 migratePopulation(w);const p=w.population!;if(w.time-p.lastAt<1-1e-8)return;p.lastAt=w.time;
 w.animals=w.animals.filter(a=>a.hp>0||a.deathAt===null||w.time-a.deathAt<config.corpseSeconds);
 let count=w.animals.filter(a=>a.hp>0).length;if(count>=config.hardCapacity)return;
 const used=new Set<string>();
 for(const a of [...w.animals]){
  const rule=config.species[a.species],eligible=(b:Animal)=>b.hp>SPECIES[b.species].hp*.6&&b.hunger<60&&b.thirst<60&&b.energy>=40&&b.life!.matureAt<=w.time&&b.life!.nextBreedAt<=w.time&&!used.has(b.id);
  if(!eligible(a)||w.animals.filter(b=>b.species===a.species&&b.hp>0).length>=rule.capacity)continue;
  const mate=w.animals.find(b=>b.id!==a.id&&b.species===a.species&&eligible(b)&&distance(a.position,b.position)<=40);if(!mate)continue;
  const positions:Array<Point>=[];for(let i=0;i<8&&positions.length<rule.brood;i++){const q={x:a.position.x+Math.cos(i*Math.PI/4)*1.5,y:a.position.y+Math.sin(i*Math.PI/4)*1.5};if(canMove(a.position,q))positions.push(q);}if(!positions.length)continue;
  used.add(a.id);used.add(mate.id);a.life!.nextBreedAt=mate.life!.nextBreedAt=w.time+rule.breedSeconds;a.energy-=8;mate.energy-=8;a.hunger+=8;mate.hunger+=8;
  for(const pos of positions){if(count>=config.hardCapacity||w.animals.filter(b=>b.species===a.species&&b.hp>0).length>=rule.capacity)break;let id:string;do{id=`animal-born-${p.nextId++}`;}while(w.animals.some(b=>b.id===id));
   w.animals.push({...structuredClone(a),id,home:{...a.home},position:pos,hp:SPECIES[a.species].hp,hunger:20,thirst:20,energy:90,mode:'rest',attacker:null,alertUntil:0,intent:null,steering:{side:1,until:0,blocked:0},blocked:0,cooldown:0,deathAt:null,carcass:0,nextDecision:w.time,life:{bornAt:w.time,matureAt:w.time+rule.matureSeconds,nextBreedAt:w.time+rule.matureSeconds+rule.breedSeconds,parents:[a.id,mate.id]}});
   p.births++;count++;w.events.push({id:++w.sequence,at:w.time,kind:'animal.born',actor:id,target:a.id,amount:1});if(w.events.length>128)w.events.shift();
  }
 }
}
