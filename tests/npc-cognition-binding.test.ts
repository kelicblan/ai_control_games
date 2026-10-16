import { expect,it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureAgency } from '../src/games/camp/npc/experience';
import { cognitionModelId,ownsCognitionBinding } from '../src/integrations/models/cognition';
import { AgencySettings } from '../src/components/AgencySettings';
import { WorldRuntime } from '../scripts/world/runtime';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
it('enables cognition with MiniMind fallback by default and migrates the previous opt-in setting',()=>{
  const state=createGame();const a=ensureAgency(state);
  expect(a.cognition).toBe(true);expect(a.modelId).toBe('minimind3');
  delete a.modelBinding;a.cognition=false;a.modelId=null;
  expect(ensureAgency(state).modelBinding).toBe('dialogue');expect(a.cognition).toBe(true);expect(a.modelId).toBe('minimind3');
});
it('follows the actual active backend and falls back to MiniMind during unavailable preferred models',()=>{
  const models=[{id:'qwen',name:'Qwen',backend:'native' as const},{id:'test-remote',name:'Test',backend:'remote' as const}];
  expect(cognitionModelId('qwen',models)).toBe('native:qwen');
  expect(cognitionModelId('test-remote',models)).toBe('test-remote');
  expect(cognitionModelId(undefined,models)).toBe('minimind3');
  expect(cognitionModelId('minimind3',models)).toBe('minimind3');
  expect(cognitionModelId('unknown',models)).toBe('minimind3');
});
it('shows the current binding without a separate cognition model selector',()=>{
  const state=createGame();ensureAgency(state);
  const html=renderToStaticMarkup(createElement(AgencySettings,{game:state,onSave:async()=>{}}));
  expect(html).not.toContain('<select');expect(html).toContain('自动跟随');expect(html).toContain('MiniMind3');
});
it('only the focused visible tab may change the shared cognition binding',()=>{
  expect(ownsCognitionBinding(true,true)).toBe(true);
  expect(ownsCognitionBinding(true,false)).toBe(false);
  expect(ownsCognitionBinding(false,true)).toBe(false);
  expect(ownsCognitionBinding(false,false)).toBe(false);
});
it('persists automatic binding and keeps it after reset and reopen',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'cognition-binding-')),file=path.join(dir,'world.sqlite');
  const runtime=new WorldRuntime(file,baselinePolicy,()=>10000);
  try{
    expect(runtime.mutate('p',0,'start',{type:'start',options:{}},'tab').state!.agency!.modelId).toBe('minimind3');
    const bound=runtime.mutate('p',1,'bind',{type:'agency-model',modelId:'native:qwen3.5-0.8b'},'tab').state!.agency!;
    expect(bound.cognition).toBe(true);expect(bound.modelBinding).toBe('dialogue');
    const reset=runtime.mutate('p',2,'reset',{type:'reset'},'tab').state!.agency!;
    expect(reset.modelId).toBe('native:qwen3.5-0.8b');expect(reset.cognition).toBe(true);
    runtime.close();const reopened=new WorldRuntime(file,baselinePolicy,()=>10000);
    try{expect(reopened.read('p').state!.agency!.modelId).toBe('native:qwen3.5-0.8b');}finally{reopened.close();}
  }finally{runtime.close();rmSync(dir,{recursive:true,force:true});}
});
it('synchronizes binding during offline catch-up without requesting stale cognition',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'binding-catchup-'));let now=10000;
  const runtime=new WorldRuntime(path.join(dir,'world.sqlite'),baselinePolicy,()=>now,1);
  try{
    runtime.mutate('p',0,'start',{type:'start',options:{seed:9}},'tab');now+=10000;
    const snapshot=runtime.mutate('p',1,'bind',{type:'agency-model',modelId:'native:qwen3.5-0.8b'},'tab');
    expect(snapshot.catchingUp).toBe(true);expect(snapshot.state!.agency!.modelId).toBe('native:qwen3.5-0.8b');
    let calls=0;runtime.setAppraisalProvider(async()=>{calls++;return '{}';});runtime.tick();expect(calls).toBe(0);
  }finally{runtime.close();rmSync(dir,{recursive:true,force:true});}
});
