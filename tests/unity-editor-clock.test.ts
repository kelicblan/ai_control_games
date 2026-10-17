import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorldRuntime} from '../scripts/world/runtime';
import {baselinePolicy} from '../src/games/camp/ai/policy';

it('Editor resume preserves progress and advances one game second per real second without replaying closed time',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'editor-clock-')),file=path.join(dir,'world.sqlite');let now=100000;
  let runtime:WorldRuntime|undefined;
  try{
    runtime=new WorldRuntime(file,baselinePolicy,()=>now,50,false);
    runtime.mutate('p',0,'start',{type:'start',options:{seed:17,mode:'rules'}},'editor');
    now+=1000;const before=runtime.read('p');expect(before.state!.elapsed).toBeCloseTo(1,5);
    runtime.close();now+=26*60*1000;
    runtime=new WorldRuntime(file,baselinePolicy,()=>now,50,false);
    const restored=runtime.read('p');expect(restored.state!.elapsed).toBe(before.state!.elapsed);expect(restored.catchingUp).toBe(false);
    expect(restored.dialogueScope).toBe(before.dialogueScope);expect(restored.state!.npcs).toEqual(before.state!.npcs);
    now+=1000;const live=runtime.read('p');expect(live.state!.elapsed-restored.state!.elapsed).toBeCloseTo(1,5);expect(live.speed).toBe(1);
  }finally{runtime?.close();rmSync(dir,{recursive:true,force:true});}
});
