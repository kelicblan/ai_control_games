import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { WorldRuntime } from '../scripts/world/runtime';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { advanceGameSteps } from '../src/games/camp/simulation/engine';
const dirs:string[]=[],runtimes:WorldRuntime[]=[];
afterEach(()=>{vi.restoreAllMocks();runtimes.splice(0).forEach(r=>r.close());dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
it('accepts grounded cognition atomically and reopens its result without calling a model again',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'appraisal-'));dirs.push(dir);const file=path.join(dir,'world.sqlite');let now=10000;
  const r=new WorldRuntime(file,baselinePolicy,()=>now);runtimes.push(r);
  r.mutate('p',0,'start',{type:'start',options:{seed:9}},'tab');
  r.mutate('p',1,'settings',{type:'agency-settings',enabled:true,cognition:true,modelId:'test'},'tab');
  r.mutate('p',2,'urge',{type:'command',command:{type:'urge',npcId:'azhuang'}},'tab');
  r.setAppraisalProvider(async(_p,_m,prompt)=>{
    const context=JSON.parse(prompt.split('\n数据：')[1]);
    return JSON.stringify({version:1,summary:'被催促后有压力，想先谈谈安排。',evidenceIds:[context.evidence[0].id],goal:'说明处境',emotionAssessment:{anger:.4,resentment:.3,stress:.5},preferences:{bargain:.2},expression:{text:'先听听我的难处。',targetId:null}});
  });
  r.tick();await new Promise(resolve=>setTimeout(resolve,0));r.tick();
  const accepted=r.read('p').state!;expect(accepted.agency!.people.azhuang!.appraisalStatus).toBe('ready');
  const db=new DatabaseSync(file);expect(Number(db.prepare('SELECT COUNT(*) n FROM npc_appraisals').get()!.n)).toBeGreaterThan(0);db.close();
  r.close();
  const reopened=new WorldRuntime(file,baselinePolicy,()=>now);runtimes.push(reopened);
  const recovered=reopened.read('p').state!;
  expect(recovered.agency!.people.azhuang!.appraisal).toEqual(accepted.agency!.people.azhuang!.appraisal);
  vi.spyOn(performance,'now').mockReturnValue(0);
  expect(advanceGameSteps(recovered,10,baselinePolicy)).toEqual(advanceGameSteps(accepted,10,baselinePolicy));
  now+=1000;
});
it('reset invalidates delayed cognition and clears old memory identities',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'appraisal-reset-'));dirs.push(dir);const file=path.join(dir,'world.sqlite');
  const r=new WorldRuntime(file,baselinePolicy,()=>10000);runtimes.push(r);let release:(s:string)=>void=()=>{};
  r.mutate('p',0,'start',{type:'start',options:{}},'tab');r.mutate('p',1,'settings',{type:'agency-settings',enabled:true,cognition:true,modelId:'test'},'tab');
  r.mutate('p',2,'urge',{type:'command',command:{type:'urge',npcId:'azhuang'}},'tab');
  const old=r.memories('p','azhuang');r.setAppraisalProvider(async()=>new Promise<string>(res=>{release=res;}));r.tick();
  r.mutate('p',3,'reset',{type:'reset'},'tab');release('{}');await new Promise(res=>setTimeout(res,0));r.tick();
  expect(Object.values(r.read('p').state!.agency!.people).every(p=>p.memory.recent.length===0&&p.appraisal===null)).toBe(true);expect(r.read('p').state!.agency!.modelId).toBe('test');expect(r.memories('p','azhuang').items).toEqual([]);
  expect(()=>r.memories('p','azhuang',1,{generation:old.generation!,branch:old.branch!})).toThrow('过期');
});
it('keeps a single native ticket in flight and gives other due NPCs the next slot',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'native-tickets-'));dirs.push(dir);
  const r=new WorldRuntime(path.join(dir,'world.sqlite'),baselinePolicy,()=>10000);runtimes.push(r);
  r.mutate('p',0,'start',{type:'start',options:{seed:9}},'tab');
  r.mutate('p',1,'settings',{type:'agency-settings',enabled:true,cognition:true,modelId:'native:qwen3-4b'},'tab');
  r.mutate('p',2,'urge-a',{type:'command',command:{type:'urge',npcId:'azhuang'}},'tab');
  r.mutate('p',3,'urge-b',{type:'command',command:{type:'urge',npcId:'linlan'}},'tab');
  const calls:{name:string;release:(s:string)=>void;context:{evidence:{id:string}[]}}[]=[];
  r.setAppraisalProvider(async(_p,_m,prompt)=>new Promise<string>(release=>{const context=JSON.parse(prompt.split('\n数据：')[1]);calls.push({name:context.name,context,release});}));
  r.tick();await new Promise(resolve=>setTimeout(resolve,0));r.tick();expect(calls).toHaveLength(1);
  const first=calls[0];first.release(JSON.stringify({version:1,summary:'想先说明困难。',evidenceIds:[first.context.evidence[0].id],goal:'协商',emotionAssessment:{anger:.2,resentment:.2,stress:.2},preferences:{bargain:.2},expression:{text:'先谈谈。',targetId:null}}));
  await new Promise(resolve=>setTimeout(resolve,0));r.tick();await new Promise(resolve=>setTimeout(resolve,0));
  expect(calls).toHaveLength(2);expect(calls[1].name).not.toBe(first.name);
});
it('rotates native inference fairly across persisted player worlds',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'native-player-fairness-'));dirs.push(dir);
  const r=new WorldRuntime(path.join(dir,'world.sqlite'),baselinePolicy,()=>10000);runtimes.push(r);
  for(const player of ['older','current']){
    r.mutate(player,0,'start',{type:'start',options:{seed:9}},'tab');
    r.mutate(player,1,'settings',{type:'agency-settings',enabled:true,cognition:true,modelId:'native:qwen3-4b'},'tab');
    r.mutate(player,2,'urge-a',{type:'command',command:{type:'urge',npcId:'azhuang'}},'tab');
    r.mutate(player,3,'urge-b',{type:'command',command:{type:'urge',npcId:'linlan'}},'tab');
  }
  const calls:{player:string;release:(s:string)=>void}[]=[];
  r.setAppraisalProvider(async(player)=>new Promise<string>(release=>calls.push({player,release})));
  r.tick();await new Promise(resolve=>setTimeout(resolve,0));expect(calls[0].player).toBe('older');
  calls[0].release('{}');await new Promise(resolve=>setTimeout(resolve,0));r.tick();await new Promise(resolve=>setTimeout(resolve,0));
  expect(calls[1].player).toBe('current');
});
