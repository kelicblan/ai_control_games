/** Real local model + authoritative social coordinator; isolated SQLite, never changes player settings. */
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {WorldRuntime} from './world/runtime';import {NativeAppraisal} from './world/native-appraisal';
import {SocietyService} from './world/society-service';import {Moderation} from './world/moderation/service';import {Lexicon} from './world/moderation/lexicon';
import {baselinePolicy} from '../src/games/camp/ai/policy';import {advanceGame} from '../src/games/camp/simulation/engine';import {postMessage} from '../src/games/camp/social/state';
const root=process.cwd(),dir=mkdtempSync(path.join(tmpdir(),'social-model-world-')),world=new WorldRuntime(path.join(dir,'world.sqlite'),baselinePolicy,()=>1000);
const native=new NativeAppraisal(root),lexicon=new Lexicon(path.join(root,'config/moderation/blocked-words.txt'));
const service=new SocietyService(world,new Moderation(lexicon),()=>((prompt,schema,signal)=>native.generateJSON('qwen3.5-0.8b',prompt,schema,signal)));
try{
 for(const player of ['npc','choices']){
  const snap=world.mutate(player,0,'start',{type:'start',options:{difficulty:'cozy'}},'validation');
  world.socialCommit(player,snap.dialogueScope!,s=>{
   s.status='paused';s.agency!.modelId='native:qwen3.5-0.8b';s.agency!.enabled=false;
   for(const [id,x]of [['aye',38],['linlan',62]] as const){const n=s.npcs.find(n=>n.id===id)!;n.position={x,y:110};n.health=100;n.energy=95;n.hunger=10;n.action=null;n.inventory={wood:0,food:0};}
   postMessage(s,'aye',[player==='npc'?'linlan':'player'],{text:'今天天气好，去寨里广场聊聊近况吧？',intent:'invite',locationId:'plaza'},'safety',lexicon.version);
  });
  await service.process(player);
 }
 let s=structuredClone(world.read('npc').state!);const reply=s.socialLife!.messages.at(-1)!;
 if(s.socialLife!.appointments.length){s.status='playing';for(let i=0;i<300&&s.socialLife!.appointments[0].stage!=='talking';i++)s=advanceGame(s,.1,baselinePolicy);}
 const choiceSnap=world.read('choices'),first=choiceSnap.state!.socialLife!.choices[0];
 if(first){await service.mutate('choices',choiceSnap.revision,'refresh',{type:'social-refresh',setId:first.id,scope:choiceSnap.dialogueScope!},'validation');await service.process('choices');}
 const next=world.read('choices').state!.socialLife!.choices[0];
 console.log(JSON.stringify({backend:'native:qwen3.5-0.8b',replySource:reply.source,replyIntent:reply.intent,appointmentStage:s.socialLife!.appointments[0]?.stage??'not-agreed',positions:s.socialLife!.appointments[0]?.meetingPositions,firstOptions:first?.options.length??0,refreshedOptions:next?.options.length??0,changedBatch:Boolean(first&&next&&first.id!==next.id),changedTexts:Boolean(first&&next&&next.options.some(n=>!first.options.some(o=>o.text===n.text))),generatedChoicesMadeNoAppointment:world.read('choices').state!.socialLife!.appointments.length===0}));
}finally{service.close();world.close();native.dispose();lexicon.close();}
