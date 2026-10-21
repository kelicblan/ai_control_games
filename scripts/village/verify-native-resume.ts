import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { VillageRuntime } from '../world/village-runtime';
import { ensure } from '../../packages/action-runtime/src/json';

const root=process.cwd(),run=path.resolve(process.argv[2]??'');
ensure(run.startsWith(path.join(root,'native/Artifacts/slice-')),'Native probe run required');
const read=(name:string)=>JSON.parse(readFileSync(path.join(run,name),'utf8'));
const processInfo=read('processes.json'),proof=read('village-persistence.json');
ensure(proof.success&&read('launcher-result.json').success,'Native persistence proof must pass first');
const database=path.resolve(processInfo.database);
ensure(database.startsWith(path.join(root,'native/LocalData')+path.sep),'Only isolated local native databases may be verified');
const owner=JSON.parse(readFileSync(path.join(path.dirname(database),'identity.json'),'utf8')).player;
const runtime=new VillageRuntime(database,Date.now,false);
try{
 const restored=runtime.read(owner);
 ensure(restored&&restored.worldId===proof.worldId&&restored.paused&&restored.revision===proof.revision&&restored.actors.player.equipment===proof.itemId,'Restart changed native save, pause or physical equipment');
 for(const head of ['life','tactical'])ensure(restored.models[head]?.modelHash===proof.models[head]?.modelHash,'Restart loaded a different model');
 const report={success:true,restartedRuntime:true,worldId:restored.worldId,revision:restored.revision,paused:restored.paused,itemId:restored.actors.player.equipment,models:restored.models};
 writeFileSync(path.join(run,'village-resume.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{runtime.close();}
