import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorldRuntime} from '../scripts/world/runtime';
import {ACTIONS,type PolicyFunction} from '../src/games/camp/simulation/types';

const idle:PolicyFunction=()=>({action:'camp',emotion:'calm',source:'rules',latencyMs:0,scores:ACTIONS.map(a=>Number(a==='camp'))});
it('accepts explicit hunting through the authoritative protocol and restores its task from SQLite',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'camp-wilderness-')),file=path.join(dir,'world.sqlite');
  let runtime:WorldRuntime|undefined;
  try{
    runtime=new WorldRuntime(file,idle,()=>100000);
    const started=runtime.mutate('p',0,'start',{type:'start',options:{seed:17,difficulty:'cozy'}},'tab');
    const hunted=runtime.mutate('p',started.revision,'hunt',{type:'command',command:{type:'hunt',npcId:'azhuang'}},'tab');
    expect(hunted.state!.npcs[0].wildTask?.kind).toBe('hunt');
    const task=structuredClone(hunted.state!.npcs[0].wildTask),ecology=structuredClone(hunted.state!.world!.ecology);
    runtime.close();runtime=new WorldRuntime(file,idle,()=>100000);
    const restored=runtime.read('p','tab');expect(restored.state!.npcs[0].wildTask).toEqual(task);expect(restored.state!.world!.ecology).toEqual(ecology);
  }finally{runtime?.close();rmSync(dir,{recursive:true,force:true});}
});
