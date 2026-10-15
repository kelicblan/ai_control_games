import {it,expect} from 'vitest';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {WorldRuntime} from '../scripts/world/runtime';import {baselinePolicy} from '../src/games/camp/ai/policy';
import {SocietyService} from '../scripts/world/society-service';import {Lexicon} from '../scripts/world/moderation/lexicon';import {Moderation} from '../scripts/world/moderation/service';
it('shows ordinary system and history text immediately and only masks configured words',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'history-')),file=path.join(dir,'words.txt');writeFileSync(file,'');
 const world=new WorldRuntime(path.join(dir,'w.sqlite'),baselinePolicy,()=>1000);const state=world.mutate('p',0,'s',{type:'start',options:{}},'t').state!;
 let calls=0;const lexicon=new Lexicon(file),service=new SocietyService(world,new Moderation(lexicon),()=>async()=>{calls++;throw new Error('offline');});
 const value={text:'测试禁词在这里。'};expect(service.project('p',state,value).text).toBe(value.text);
 expect(service.project('p',state,{events:[{id:1,text:'伙伴已返回营地。'}]}).events[0].text).toBe('伙伴已返回营地。');
 writeFileSync(file,'测试禁词');lexicon.reload();expect(service.project('p',state,value).text).not.toContain('测试禁词');
 writeFileSync(file,'共产党\n党员');lexicon.reload();
 const output=service.project('p',state,{id:'党员',text:'共产党和党员；其他文字正常。',memory:{fact:'党员在营地。'}});
 expect(output).toEqual({id:'党员',text:'**和**；其他文字正常。',memory:{fact:'**在营地。'}});
 expect(calls).toBe(0);
 service.close();lexicon.close();world.close();rmSync(dir,{recursive:true,force:true});
});
