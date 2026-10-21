import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {tsImport} from 'tsx/esm/api';
process.env.CAMP_WORLD_LAYOUT='new-world-v1';process.env.CAMP_SOCIAL_OFFLINE='1';process.env.CAMP_VILLAGE_OFFLINE_PROGRESS='0';
const {VillageRuntime}=await tsImport('../world/village-runtime.ts',import.meta.url);
const {newWorld,newWorldRoute}=await tsImport('../../src/games/camp/world/newWorldProfile.ts',import.meta.url);
const forest=newWorld.forestExpansion,temporary=fs.mkdtempSync(path.join(os.tmpdir(),'camp-forest-probe-')),file=path.join(temporary,'world.sqlite');
let runtime=new VillageRuntime(file,()=>1000,false);
const report={success:false,isolatedSave:true,resourceGathered:false,restartPreservedDepletion:false};
try{
  runtime.create('forest-test',{id:'forest-runtime',worldId:'forest-runtime',classification:'experiment',ruleVersion:'p4-social-content-v1',seed:64138,actors:[],inventory:{food:30},storePosition:newWorld.spawn,navigationMode:'shared-world'},true);
  runtime.tick();let state=runtime.read('forest-test');
  const site=forest.resources.filter(s=>s.kind==='berries').sort((a,b)=>newWorldRoute(newWorld.spawn,b.stand).length-newWorldRoute(newWorld.spawn,a.stand).length)[0];
  const before=state.economy.foodSources[site.id].remaining;
  const receipt=runtime.command('forest-test',state.revision,{operationId:'forest-gather-probe',actorId:'player',action:'GATHER_FOOD',targetId:site.id,parameters:{},source:'player_input',issuedAtTick:state.tick,readSet:{'actor:player':state.versions['actor:player']??0}});
  if(!receipt.accepted)throw Error(JSON.stringify(receipt));
  for(let i=0;i<1800;i++){runtime.tick();state=runtime.read('forest-test');const task=state.executions[receipt.executionId];if(task.status==='completed')break;if(task.status==='failed'||task.status==='cancelled')throw Error(JSON.stringify(task));}
  const task=state.executions[receipt.executionId];if(task.status!=='completed')throw Error(`Collection did not complete: ${task.status}`);
  if(state.economy.foodSources[site.id].remaining!==before-1||state.actors.player.carried.food!==1)throw Error('Collection did not consume exactly one source unit');
  report.resourceGathered=true;report.site=site.id;report.simulationTicks=state.tick;report.playerPosition=state.actors.player.position;
  report.deerHomes=state.ecology.animals.filter(a=>a.species==='deer').map(a=>a.home);report.boarHomes=state.ecology.animals.filter(a=>a.species==='boar').map(a=>a.home);
  runtime.close();runtime=new VillageRuntime(file,()=>1000,false);const restored=runtime.read('forest-test');
  if(restored.economy.foodSources[site.id].remaining!==before-1||restored.actors.player.carried.food!==1)throw Error('Source depletion lost on restart');
  report.restartPreservedDepletion=true;report.success=true;
}finally{
  runtime.close();if(path.dirname(path.resolve(temporary)).toLowerCase()!==path.resolve(os.tmpdir()).toLowerCase()||!path.basename(temporary).startsWith('camp-forest-probe-'))throw Error('Unsafe test cleanup');
  fs.rmSync(temporary,{recursive:true,force:true});fs.writeFileSync('native/Artifacts/forest-expansion/gameplay-validation.json',JSON.stringify(report,null,2));
}
await new Promise(resolve=>process.stdout.write(JSON.stringify(report)+'\n',resolve));
// The world has been closed above; diagnostic-only policy timers must not retain this CLI.
process.exit(0);
