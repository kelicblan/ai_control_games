import {readFileSync,writeFileSync} from 'node:fs';
import {loadAnimalModel} from '../../src/games/camp/animals/model';
import {createAnimalWorld,stepAnimals,teacherAction,random,hurtAnimal,SPECIES,type Human} from '../../src/games/camp/animals/engine';
const model=loadAnimalModel();const reference=JSON.parse(readFileSync('native/Artifacts/animals/mlp-v1/parity-reference.json','utf8'));
let maxError=0;for(const r of reference){const actual=model.scores(r.input);for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-r.scores[i]));}if(maxError>1e-4)throw new Error('Animal Python/TS parity failed '+maxError);
const results=[];
for(const source of ['teacher','mlp'] as const)for(const seed of [1126,1127,1128,1129,1130]){
 const habitats=Array.from({length:24},(_,i)=>({x:i%6*14,y:Math.floor(i/6)*14}));const w=createAnimalWorld(seed,habitats);
 for(let i=0;i<w.animals.length;i++){const a=w.animals[i];a.hunger=random(seed,i+700)*99;a.thirst=random(seed,i+800)*99;a.energy=10+random(seed,i+900)*90;}
 const humans:Human[]=[{id:'hunter',position:{x:20,y:15},hp:100,attack:15,defense:4,range:2}];let humanDamage=0;const actionCounts:Record<string,number>={};let inferenceMs=0,decisions=0;
 for(let tick=0;tick<3000;tick++){
  if(tick===100){const bear=w.animals.find(a=>a.species==='bear')!;humans[0].position={x:bear.position.x+1.4,y:bear.position.y};hurtAnimal(w,bear,3,'hunter');}
  stepAnimals(w,humans,.1,(_a,b)=>b.x>=-30&&b.x<=110&&b.y>=-30&&b.y<=90&&!(b.x>28&&b.x<32&&b.y<25),o=>{const start=performance.now();const c=source==='mlp'?model.decide(o):teacherAction(o);inferenceMs+=performance.now()-start;decisions++;actionCounts[c.action]=(actionCounts[c.action]??0)+1;return c;},source,(_id,damage)=>{humanDamage+=damage;humans[0].hp=Math.max(0,humans[0].hp-damage);});
 }
 results.push({source,seed,seconds:w.time,species:Object.fromEntries(Object.keys(SPECIES).map(species=>{const group=w.animals.filter(a=>a.species===species);return[species,{alive:group.filter(a=>a.hp>0).length,total:group.length,meanHunger:group.reduce((n,a)=>n+a.hunger,0)/group.length,meanThirst:group.reduce((n,a)=>n+a.thirst,0)/group.length}]})),metrics:w.metrics,actionCounts,humanDamage,inferenceMeanMs:inferenceMs/decisions});
}
const report={success:true,modelHash:model.hash,parity:{samples:reference.length,maxError},training:model.report,closedLoop:results,scope:'heldout seeds; bounded unseen obstacle arena; 300 seconds; not a population-balance guarantee'};
writeFileSync('native/Artifacts/animals/mlp-v1/evaluation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({modelHash:model.hash,parity:report.parity,runs:results.map(r=>({source:r.source,seed:r.seed,metrics:r.metrics,alive:Object.values(r.species).reduce((n,s)=>n+s.alive,0),humanDamage:r.humanDamage,inferenceMs:r.inferenceMeanMs}))}));
