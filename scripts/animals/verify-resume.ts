import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ensure} from '../../packages/action-runtime/src/json';
process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const {VillageRuntime}=await import('../world/village-runtime');
const run=path.resolve(process.argv[2]??'');ensure(run.startsWith(path.resolve('native/Artifacts/slice-')),'Native animal probe required');
const info=JSON.parse(readFileSync(path.join(run,'processes.json'),'utf8')),proof=JSON.parse(readFileSync(path.join(run,'animal-persistence.json'),'utf8')),native=JSON.parse(readFileSync(path.join(run,'animal-result.json'),'utf8'));
const owner=JSON.parse(readFileSync(path.join(path.dirname(info.database),'identity.json'),'utf8')).player;
const r=new VillageRuntime(info.database,Date.now,false);try{const s=r.read(owner) as any;ensure(proof.success&&native.success&&s.worldId===proof.worldId&&s.paused&&s.ecology.time===proof.time&&s.ecology.animals.length===22&&s.ecology.model.modelHash===native.model.modelHash,'Animal restart mismatch');const report={success:true,restartedRuntime:true,worldId:s.worldId,paused:s.paused,animalCount:22,time:s.ecology.time,modelHash:s.ecology.model.modelHash};writeFileSync(path.join(run,'animal-resume.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{r.close();}
