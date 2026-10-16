import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';
import {Lexicon} from '../scripts/world/moderation/lexicon';
import {Moderation} from '../scripts/world/moderation/service';
import {ReviewedAppraisals} from '../scripts/world/moderation/appraisals';
import {WorldRuntime} from '../scripts/world/runtime';
import {baselinePolicy} from '../src/games/camp/ai/policy';
it('masks cognition before persistence and invalidates accepted content on word updates',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'appraisal-gate-')),file=path.join(dir,'words');writeFileSync(file,'测试禁词');
 const lexicon=new Lexicon(file),gate=new ReviewedAppraisals(new Moderation(lexicon));
 const signal=new AbortController().signal,raw=JSON.stringify({summary:'测试禁词',goal:'休息',expression:{text:'歇一会。',targetId:null}});
 await expect(gate.review(raw,async()=>'{"safe":false}',AbortSignal.abort())).rejects.toThrow('未通过');
 expect(gate.accepts(raw)).toBe(false);
 const safe=await gate.review(raw,async()=>'{"safe":true}',signal);expect(JSON.parse(safe).summary).toBe('**');expect(gate.accepts(safe)).toBe(true);
 writeFileSync(file,'测试禁词\n休息');lexicon.reload();expect(gate.accepts(safe)).toBe(false);
 const world=new WorldRuntime(path.join(dir,'world.sqlite'),baselinePolicy,()=>10000);
 try{
  world.mutate('p',0,'start',{type:'start',options:{}},'tab');
  world.mutate('p',1,'settings',{type:'agency-settings',enabled:true,cognition:true,modelId:'test'},'tab');
  world.mutate('p',2,'urge',{type:'command',command:{type:'urge',npcId:'azhuang'}},'tab');
  world.setAppraisalPublicationGate(v=>gate.accepts(v));
  world.setAppraisalProvider(async(_p,_m,prompt)=>{
   const c=JSON.parse(prompt.split('\n数据：')[1]);
   return JSON.stringify({version:1,summary:'测试禁词',evidenceIds:[c.evidence[0].id],goal:'休息',emotionAssessment:{anger:.5,resentment:.5,stress:.5},preferences:{bargain:.2},expression:{text:'谈谈。',targetId:null}});
  });
  world.tick();await new Promise(r=>setTimeout(r,0));world.tick();
  expect(world.read('p').state!.agency!.people.azhuang!.appraisal).toBeNull();
 }finally{world.close();lexicon.close();rmSync(dir,{recursive:true,force:true});}
});
