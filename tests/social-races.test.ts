import {it,expect} from 'vitest';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {WorldRuntime} from '../scripts/world/runtime';import {baselinePolicy} from '../src/games/camp/ai/policy';
import {SocietyService} from '../scripts/world/society-service';import {Lexicon} from '../scripts/world/moderation/lexicon';import {Moderation} from '../scripts/world/moderation/service';
import {postMessage} from '../src/games/camp/social/state';
for(const change of ['reset','lexicon'] as const)it(`drops a delayed social acceptance after ${change}`,async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'society-race-')),file=path.join(dir,'words');writeFileSync(file,'');
 const world=new WorldRuntime(path.join(dir,'world.sqlite'),baselinePolicy,()=>1000),lexicon=new Lexicon(file);
 let release!:(raw:string)=>void;const service=new SocietyService(world,new Moderation(lexicon),()=>async prompt=>prompt.includes('内容审核器')?'{"safe":true}':new Promise<string>(r=>{release=r;}));
 try{
  const snap=world.mutate('p',0,'start',{type:'start',options:{}},'t');
  world.socialCommit('p',snap.dialogueScope!,s=>postMessage(s,'aye',['linlan'],{text:'广场聊聊？',intent:'invite',locationId:'plaza'},'safety','v1'));
  const work=service.process('p');await new Promise(r=>setTimeout(r,0));
  if(change==='reset')await service.mutate('p',world.read('p').revision,'reset',{type:'reset'},'t');
  else {writeFileSync(file,'测试禁词');lexicon.reload();}
  release(JSON.stringify({text:'好，广场见。',intent:'accept',locationId:'plaza'}));await work;
  expect(world.read('p').state!.socialLife?.appointments??[]).toHaveLength(0);
  expect(world.read('p').state!.socialLife?.messages.some(m=>m.text==='好，广场见。')??false).toBe(false);
 }finally{service.close();world.close();lexicon.close();rmSync(dir,{recursive:true,force:true});}
});
