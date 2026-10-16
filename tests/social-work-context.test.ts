import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorldRuntime} from '../scripts/world/runtime';
import {baselinePolicy} from '../src/games/camp/ai/policy';
import {SocietyService} from '../scripts/world/society-service';
import {Lexicon} from '../scripts/world/moderation/lexicon';
import {Moderation} from '../scripts/world/moderation/service';
import {postMessage,ensureSocialLife} from '../src/games/camp/social/state';
import {issueCommand} from '../src/games/camp/simulation/engine';

function setup(generate:(prompt:string)=>Promise<string>){
 const dir=mkdtempSync(path.join(tmpdir(),'work-context-'));writeFileSync(path.join(dir,'words'),'');
 const world=new WorldRuntime(path.join(dir,'w.sqlite'),baselinePolicy,()=>1000),lexicon=new Lexicon(path.join(dir,'words'));
 const service=new SocietyService(world,new Moderation(lexicon),()=>generate);
 const snap=world.mutate('p',0,'start',{type:'start',options:{}},'t');
 return {world,service,scope:snap.dialogueScope!,close(){service.close();world.close();lexicon.close();rmSync(dir,{recursive:true,force:true});}};
}
it('does not manufacture a chat invitation on a timer without a work event',async()=>{
 let calls=0;const f=setup(async()=>{calls++;return '{"text":"广场聊聊？","intent":"invite","locationId":"plaza"}';});
 try{f.world.socialCommit('p',f.scope,s=>{ensureSocialLife(s).nextInitiativeAt=0;});await f.service.process('p');
 expect(calls).toBe(0);expect(f.world.read('p').state!.socialLife!.messages).toHaveLength(0);}finally{f.close();}
});
it('preserves a real work request when the model is unavailable instead of replacing it with a refusal',async()=>{
 const f=setup(async()=>{throw Error('offline');});
 try{f.world.socialCommit('p',f.scope,s=>{Object.assign(s,issueCommand(s,{type:'social-open',npcId:'aye',topic:'food'}));const t=s.social.threads.at(-1)!;t.prompt='仓库粮不够，我这趟先采食物，可以吗？';t.lines.find(l=>l.speaker==='aye')!.text=t.prompt;});
 await f.service.process('p');expect(f.world.read('p').state!.socialLife!.messages[0]).toMatchObject({text:'仓库粮不够，我这趟先采食物，可以吗？',intent:'ask',from:'aye',to:['player']});}finally{f.close();}
});
it('gives the responding NPC the exchange history and both sides actual work',async()=>{
 let prompt='';const f=setup(async p=>{prompt=p;return '{"text":"我先把背包的木材交仓，再谈换班。","intent":"end"}';});
 try{f.world.socialCommit('p',f.scope,s=>{s.npcs.find(n=>n.id==='linlan')!.inventory.wood=2;const first=postMessage(s,'linlan',['aye'],{text:'我背着木材，回仓以后能换班吗？',intent:'ask'},'template','v');first.replies.aye='replied';postMessage(s,'aye',['linlan'],{text:'你这趟送到哪了？',intent:'ask'},'template','v',first);});
 await f.service.process('p');expect(prompt).toContain('我背着木材，回仓以后能换班吗？');expect(prompt).toContain('inventory');expect(prompt).toContain('wood');expect(prompt).toContain('sender');
 const speaker=f.world.read('p').state!.npcs.find(n=>n.id==='linlan')!;
 expect(prompt).toContain(`你是${speaker.name}（linlan）`);
 expect(prompt).toContain('这句话是对方说的，不是你的答案');
 expect(prompt).toContain('heard是听说');
 }finally{f.close();}
});
it('does not publish an obsolete work report after a task changes during generation',async()=>{
 let release!:(s:string)=>void;const f=setup(()=>new Promise(r=>{release=r;}));
 try{f.world.socialCommit('p',f.scope,s=>postMessage(s,'aye',['linlan'],{text:'你这趟送到哪了？',intent:'ask'},'template','v'));
 const pending=f.service.process('p');await new Promise(r=>setTimeout(r,0));
 f.world.socialCommit('p',f.scope,s=>{s.npcs.find(n=>n.id==='linlan')!.inventory.food=3;});
 release('{"text":"我正空手在广场等你。","intent":"end"}');await pending;
 expect(f.world.read('p').state!.socialLife!.messages.at(-1)!.text).toContain('物资送到仓库');
 }finally{f.close();}
});
it('does not turn a work question into a new meeting invitation',async()=>{
 const f=setup(async()=>'{"text":"我们去广场聊天吧。","intent":"invite","locationId":"plaza"}');
 try{f.world.socialCommit('p',f.scope,s=>postMessage(s,'aye',['linlan'],{text:'你这趟木材什么时候送回来？',intent:'ask'},'template','v'));
 await f.service.process('p');expect(f.world.read('p').state!.socialLife!.messages.at(-1)!.intent).toBe('end');
 expect(f.world.read('p').state!.socialLife!.appointments).toHaveLength(0);
 }finally{f.close();}
});
