import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect,it } from 'vitest';
import { WorldRuntime } from '../scripts/world/runtime';
import { SnapshotStore } from '../scripts/world/store';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { ensureAgency } from '../src/games/camp/npc/experience';
import { createGame } from '../src/games/camp/simulation/engine';
it('enables cognition with MiniMind fallback by default and migrates the previous opt-in setting',()=>{
  const state=createGame();const a=ensureAgency(state);
  expect(a.cognition).toBe(true);expect(a.modelId).toBe('minimind3');
  delete a.modelBinding;a.cognition=false;a.modelId=null;
  expect(ensureAgency(state).modelBinding).toBe('dialogue');expect(a.cognition).toBe(true);expect(a.modelId).toBe('minimind3');
});
it('repairs an empty dialogue binding and retires removed preferred models',()=>{
  for(const modelId of [null,'','native:qwen3.5-0.8b','native:qwen3-4b']){
    const state=createGame(),a=ensureAgency(state);a.modelId=modelId;a.cognition=false;
    ensureAgency(state);
    expect(a.modelId).toBe('minimind3');expect(a.cognition).toBe(true);
  }
});
it('repairs a saved null binding on read and persists the repair without resetting the world',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'binding-migration-')),file=path.join(dir,'world.sqlite');
  try{
    const state=createGame();const a=ensureAgency(state);a.modelId=null;a.cognition=false;
    const store=new SnapshotStore(file);
    store.save('p',{version:1,state,revision:7,speed:1,at:10000,pauseUntil:null,pauseOwner:null});store.close();
    for(let i=0;i<2;i++){
      const runtime=new WorldRuntime(file,baselinePolicy,()=>10000);
      try{const saved=runtime.read('p');expect(saved.revision).toBe(7);expect(saved.state!.agency!.modelId).toBe('minimind3');expect(saved.state!.agency!.cognition).toBe(true);}
      finally{runtime.close();}
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
it('persists automatic binding and keeps it after reset and reopen',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'cognition-binding-')),file=path.join(dir,'world.sqlite');
  const runtime=new WorldRuntime(file,baselinePolicy,()=>10000);
  try{
    expect(runtime.mutate('p',0,'start',{type:'start',options:{}},'tab').state!.agency!.modelId).toBe('minimind3');
    const bound=runtime.mutate('p',1,'bind',{type:'agency-model',modelId:'native:qwen3.5-2b'},'tab').state!.agency!;
    expect(bound.cognition).toBe(true);expect(bound.modelBinding).toBe('dialogue');
    const reset=runtime.mutate('p',2,'reset',{type:'reset'},'tab').state!.agency!;
    expect(reset.modelId).toBe('native:qwen3.5-2b');expect(reset.cognition).toBe(true);
    runtime.close();const reopened=new WorldRuntime(file,baselinePolicy,()=>10000);
    try{expect(reopened.read('p').state!.agency!.modelId).toBe('native:qwen3.5-2b');}finally{reopened.close();}
  }finally{runtime.close();rmSync(dir,{recursive:true,force:true});}
});
it('synchronizes binding during offline catch-up without requesting stale cognition',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'binding-catchup-'));let now=10000;
  const runtime=new WorldRuntime(path.join(dir,'world.sqlite'),baselinePolicy,()=>now,1);
  try{
    runtime.mutate('p',0,'start',{type:'start',options:{seed:9}},'tab');now+=10000;
    const snapshot=runtime.mutate('p',1,'bind',{type:'agency-model',modelId:'native:qwen3.5-2b'},'tab');
    expect(snapshot.catchingUp).toBe(true);expect(snapshot.state!.agency!.modelId).toBe('native:qwen3.5-2b');
    let calls=0;runtime.setAppraisalProvider(async()=>{calls++;return '{}';});runtime.tick();expect(calls).toBe(0);
  }finally{runtime.close();rmSync(dir,{recursive:true,force:true});}
});
