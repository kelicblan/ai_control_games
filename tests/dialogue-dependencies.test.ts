import { expect,it } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorldRuntime } from '../scripts/world/runtime';
import { baselinePolicy } from '../src/games/camp/ai/policy';
it('requires the published addressed predecessor before committing a dependent NPC reply',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'dialogue-deps-')),file=path.join(dir,'world.sqlite');
  const runtime=new WorldRuntime(file,baselinePolicy,()=>10000);
  try{
    const start=runtime.mutate('p',0,'start',{type:'start',options:{seed:17}},'tab');const scope=start.dialogueScope!;
    const parent={id:'social:42:1',npcId:'aye' as const,targetIds:['xiaomi' as const],threadId:42,lineId:1,at:0,text:'一起谈谈分工吧。',source:'minimind3',latencyMs:1};
    const child={id:'social:42:2',npcId:'xiaomi' as const,targetIds:['aye' as const],threadId:42,lineId:2,at:0,text:'我先不加入，先把话讲清楚。',source:'minimind3',latencyMs:1,replyToId:parent.id};
    expect(()=>runtime.mutate('p',1,'orphan',{type:'dialogue-result',scope,result:child},'tab')).toThrow('前置发言');
    runtime.mutate('p',1,'parent',{type:'dialogue-result',scope,result:parent},'tab');
    expect(()=>runtime.mutate('p',2,'wrong-target',{type:'dialogue-result',scope,result:{...child,targetIds:['azhuang']}},'tab')).toThrow('前置发言');
    const accepted=runtime.mutate('p',2,'child',{type:'dialogue-result',scope,result:child},'tab');
    expect(accepted.dialogues?.map(r=>r.id)).toEqual([parent.id,child.id]);
    runtime.close();const reopened=new WorldRuntime(file,baselinePolicy,()=>10000);
    try{expect(reopened.read('p').dialogues?.[1].replyToId).toBe(parent.id);}finally{reopened.close();}
  }finally{runtime.close();rmSync(dir,{recursive:true,force:true});}
});
