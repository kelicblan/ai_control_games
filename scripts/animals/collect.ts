import {mkdirSync,writeFileSync} from 'node:fs';
import {createAnimalWorld,stepAnimals,teacherAction,random,hurtAnimal,type Observation,type Human} from '../../src/games/camp/animals/engine';
import {animalEngineHash} from '../../src/games/camp/animals/model';
const rows:unknown[]=[];const seeds=Array.from({length:30},(_,i)=>1101+i);
for(const seed of seeds){const habitats=Array.from({length:24},(_,i)=>({x:(i%6)*14,y:Math.floor(i/6)*14}));const w=createAnimalWorld(seed,habitats);
 for(let i=0;i<w.animals.length;i++){const a=w.animals[i];a.hunger=random(seed,i+700)*99;a.thirst=random(seed,i+800)*99;a.energy=10+random(seed,i+900)*90;a.hp*=.3+random(seed,i+1000)*.7;}
 const humans:Human[]=[{id:'hunter',position:{x:20,y:15},hp:100,attack:15,defense:4,range:2}];
 for(let tick=0;tick<1200;tick++){
  if(tick%100===0){const quarry=w.animals[(Math.floor(tick/100)+seed)%w.animals.length];if(quarry.hp>0){humans[0].position={x:quarry.position.x+1.4,y:quarry.position.y};humans[0].hp=100;hurtAnimal(w,quarry,3,'hunter');}}
  const pending:{o:Observation;chosen:number;species:string;id:string;hp:number}[]=[];
  stepAnimals(w,humans,.1,(_a,b)=>seed%3!==0||!(b.x>28&&b.x<32&&b.y<25),(o,a)=>{const c=teacherAction(o);pending.push({o:structuredClone(o),chosen:o.candidates.indexOf(c as never),species:a.species,id:a.id,hp:a.hp});return c;},'teacher',(id,damage)=>{humans.find(h=>h.id===id)!.hp=Math.max(0,humans.find(h=>h.id===id)!.hp-damage);});
  for(const p of pending)rows.push({seed,species:p.species,input:p.o,chosenIndex:p.chosen,executionId:`animal-${seed}-${tick}-${p.id}`,outcome:{status:'executed',hpAfter:w.animals.find(a=>a.id===p.id)?.hp??0,hpBefore:p.hp,at:w.time}});
 }
}
const engineHash=animalEngineHash();
mkdirSync('native/Artifacts/animals/mlp-v1',{recursive:true});writeFileSync('native/Artifacts/animals/mlp-v1/dataset.json',JSON.stringify({format:'animal-real-executor-v1',engineHash,trainSeeds:seeds.slice(0,20),validationSeeds:seeds.slice(20,25),testSeeds:seeds.slice(25),rows}));
console.log(JSON.stringify({engineHash,rows:rows.length,heads:rows.reduce((m:any,r:any)=>(m[r.input.head]=(m[r.input.head]??0)+1,m),{})}));
