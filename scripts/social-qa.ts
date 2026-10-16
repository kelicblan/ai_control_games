/** Isolated browser fixture; never opens the player's database. */
import { mkdtempSync } from 'node:fs';import { tmpdir } from 'node:os';import path from 'node:path';import { fork } from 'node:child_process';
import { WorldRuntime } from './world/runtime';import { baselinePolicy } from '../src/games/camp/ai/policy';
import { postMessage,respond } from '../src/games/camp/social/state';
const directory=mkdtempSync(path.join(tmpdir(),'camp-social-ui-')),file=path.join(directory,'world.sqlite');
const runtime=new WorldRuntime(file,baselinePolicy);
for(const [id,mode]of [['00000000-0000-4000-8000-000000000011','player'],['00000000-0000-4000-8000-000000000012','npc']] as const){
 const snapshot=runtime.mutate(id,0,'start',{type:'start',options:{mode:'rules',difficulty:'cozy'}},'fixture');
 runtime.socialCommit(id,snapshot.dialogueScope!,state=>{
  state.agency!.cognition=false;state.agency!.enabled=false;
  if(mode==='player'){state.status='paused';postMessage(state,'aye',['player'],{text:'我们去广场聊聊吧。',intent:'invite',locationId:'plaza'},'safety','fixture');}
  else{
   state.status='paused';
   const a=state.npcs.find(n=>n.id==='aye')!,b=state.npcs.find(n=>n.id==='linlan')!;
   a.position={x:35,y:110};b.position={x:65,y:110};
   for(const n of[a,b]){n.health=100;n.energy=95;n.hunger=10;n.action=null;n.inventory={wood:0,food:0};}
   const m=postMessage(state,'aye',['linlan'],{text:'到广场聊聊吧。',intent:'invite',locationId:'plaza'},'safety','fixture');
   respond(state,m.id,'linlan',{text:'好的，广场见。',intent:'accept',locationId:'plaza'},'safety','fixture');
  }
 });
}
runtime.close();
const child=fork(path.resolve('scripts/local-game.ts'),['start','--session=social-qa','--port=5175','--world-port=18085'],{execArgv:['--import','tsx'],windowsHide:true,stdio:'inherit',env:{...process.env,CAMP_WORLD_DB:file,CAMP_SOCIAL_OFFLINE:'1'}});
const stop=()=>{if(child.connected)child.disconnect();};
process.once('SIGINT',stop);process.once('SIGTERM',stop);child.on('exit',code=>process.exit(code??0));
