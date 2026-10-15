import {it,expect} from 'vitest';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {WorldRuntime} from '../scripts/world/runtime';import {baselinePolicy} from '../src/games/camp/ai/policy';
import {postMessage,respond} from '../src/games/camp/social/state';
it('persists messages, acknowledgement and one appointment together across restart',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'social-save-')),file=path.join(dir,'w.sqlite');let world=new WorldRuntime(file,baselinePolicy,()=>1000);
 const snapshot=world.mutate('p',0,'start',{type:'start',options:{}},'t');
 world.socialCommit('p',snapshot.dialogueScope!,state=>{const m=postMessage(state,'aye',['linlan'],{text:'到广场聊聊吧。',intent:'invite',locationId:'plaza'},'safety','v1');respond(state,m.id,'linlan',{text:'好，广场见。',intent:'accept',locationId:'plaza'},'safety','v1');});
 world.close();world=new WorldRuntime(file,baselinePolicy,()=>1000);
 expect(world.read('p').state!.socialLife?.appointments).toHaveLength(1);
 expect(world.read('p').state!.socialLife?.messages[0].replies.linlan).toBe('replied');
 world.close();rmSync(dir,{recursive:true,force:true});
});
