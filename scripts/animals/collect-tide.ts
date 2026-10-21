import {mkdirSync,writeFileSync} from 'node:fs';
import {createAnimalWorld,stepAnimals,teacherAction,hurtAnimal,random,type Human} from '../../src/games/camp/animals/engine';
import {animalEngineHash} from '../../src/games/camp/animals/model';import {stepTide} from '../../src/games/camp/animals/tide';import {migratePopulation} from '../../src/games/camp/animals/population';
const rows:any[]=[],seeds=Array.from({length:30},(_,i)=>2101+i),engineHash=animalEngineHash();
for(const seed of seeds)for(const family of ['life','retaliation','hunting','gathering','attacking','retreating']){
 const w=createAnimalWorld(seed,Array.from({length:24},(_,i)=>({x:i%6*7,y:Math.floor(i/6)*7})));migratePopulation(w);const humans:Human[]=[{id:'hunter',position:{x:16,y:9},hp:200,attack:10,defense:5,range:2}];
 for(let i=0;i<w.animals.length;i++){const a=w.animals[i];a.hunger=(seed+i*13)%90;a.thirst=(seed*3+i*11)%90;a.energy=20+(seed+i*7)%80;if(family==='hunting')a.hunger=85;}
 if(['gathering','attacking','retreating'].includes(family)){const base=[...w.animals];while(w.animals.length<60){const a=structuredClone(base[w.animals.length%base.length]);a.id='animal-extra-'+w.animals.length;w.animals.push(a);}stepTide(w,{gate:{x:30,y:10},approach:{x:20,y:10},humans:[]});w.time=360;stepTide(w,{gate:{x:30,y:10},approach:{x:20,y:10},humans:[]});w.tide!.phase=family as 'gathering';w.tide!.phaseAt=w.time;if(family==='attacking')humans.push({id:'structure:gate',kind:'gate',position:{x:30,y:10},hp:1000,attack:0,defense:10,range:0});}
 const familyRows:any[]=[];let observations=0;
 for(let tick=0;tick<600;tick++){
  if(family==='retaliation'&&tick%100===0){const a=w.animals[(tick/100+seed)%w.animals.length];if(a.hp>0){humans[0].position={x:a.position.x+1.3,y:a.position.y};humans[0].hp=200;hurtAnimal(w,a,2,'hunter');}}
  const pending:any[]=[];
  stepAnimals(w,humans,.1,(_a,b)=>!(seed%3===0&&b.x>18&&b.x<20&&b.y<14),(o,a)=>{const c=teacherAction(o);if(tick%10===0||c.action==='attack')pending.push({seed,family,input:structuredClone(o),chosenIndex:o.candidates.indexOf(c as never),id:a.id,hp:a.hp});return c;},'teacher',(id,damage)=>{const h=humans.find(h=>h.id===id)!;h.hp=Math.max(0,h.hp-damage);});
  for(const p of pending){const row={seed,family,species:w.animals.find(a=>a.id===p.id)!.species,input:p.input,chosenIndex:p.chosenIndex,executionId:`${seed}:${family}:${tick}:${p.id}`,outcome:{status:'executed',hpBefore:p.hp,hpAfter:w.animals.find(a=>a.id===p.id)!.hp,at:w.time}};observations++;if(familyRows.length<160)familyRows.push(row);else{const index=Math.floor(random(seed,observations)*observations);if(index<160)familyRows[index]=row;}}
 }
 rows.push(...familyRows);
}
if(animalEngineHash()!==engineHash)throw Error('Animal engine changed during collection');const dir='native/Artifacts/animals/beast-tide-v2';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/dataset.json',JSON.stringify({format:'animal-real-executor-v1',engineHash,trainSeeds:seeds.slice(0,20),validationSeeds:seeds.slice(20,25),testSeeds:seeds.slice(25),rows}));console.log(JSON.stringify({rows:rows.length,engineHash,families:[...new Set(rows.map(r=>r.family))]}));
