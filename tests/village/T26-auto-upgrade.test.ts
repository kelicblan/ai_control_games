import { expect, it, vi } from 'vitest';
import { WorldRuntime } from '../../scripts/world/runtime';
import { baselinePolicy } from '../../src/games/camp/ai/policy';
import { VillageRuntime } from '../../scripts/world/village-runtime';
import { createGame } from '../../src/games/camp/simulation/engine';
import { digest } from '../../packages/action-runtime/src/json';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { restoreVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';

it('keeps the old save frozen during the intro before the automatic upgrade request arrives',()=>{
 vi.stubEnv('CAMP_VILLAGE_EXPERIMENTAL','1');vi.stubEnv('CAMP_VILLAGE_DEFAULT','1');let now=1000;
 const runtime=new WorldRuntime(':memory:',baselinePolicy,()=>now,50,false);
 try{
  const old=runtime.mutate('owner',0,'start',{type:'start',options:{seed:17,mode:'rules'}},'unity');const before=digest(old.state);
  now+=10000;expect(digest(runtime.read('owner').state)).toBe(before);
  expect(runtime.socialCommit('owner',old.dialogueScope!,s=>{s.food+=1;})).toBe(false);
  runtime.mutate('owner',old.revision,'old-modal-pause',{type:'pause',paused:true,temporary:true},'unity');
  expect(digest(runtime.read('owner').state)).toBe(before);
 }finally{runtime.close();vi.unstubAllEnvs();}
});

it('freezes the archived legacy simulation and rejects late legacy social commits after upgrade',()=>{
 vi.stubEnv('CAMP_VILLAGE_EXPERIMENTAL','1');let now=1000;const runtime=new WorldRuntime(':memory:',baselinePolicy,()=>now,50,false);
 try{
  const old=runtime.mutate('owner',0,'start',{type:'start',options:{seed:17,mode:'rules'}},'unity');
  runtime.village!.ensureUpgraded('owner',old.state,old.dialogueScope!);
  const before=digest(runtime.read('owner').state);now+=10000;
  expect(digest(runtime.read('owner').state)).toBe(before);
  expect(runtime.socialCommit('owner',old.dialogueScope!,s=>{s.food+=100;})).toBe(false);
  expect(digest(runtime.read('owner').state)).toBe(before);
 }finally{runtime.close();vi.unstubAllEnvs();}
});

it('upgrades the existing nine people and stock automatically, once, with an exact recoverable source backup', () => {
  const runtime = new VillageRuntime(':memory:', () => 1000, false);
  try {
    const old = createGame({ seed: 17 }); old.elapsed=3377.3;old.wood=14;old.food=8;
    const before=digest(old);
    const upgraded=runtime.ensureUpgraded('owner',old,'legacy-source');
    expect(upgraded.paused).toBe(false);
    expect(Object.keys(upgraded.actors)).toHaveLength(old.npcs.length+1);
    for(const npc of old.npcs)expect(upgraded.actors[npc.id].name).toBe(npc.name);
    expect(upgraded.inventory).toMatchObject({wood:14,food:8,stone:0,rope:0});
    expect('navigation' in upgraded).toBe(false);
    expect(upgraded.combat?.waveEpoch).toBe(upgraded.elapsed);
    expect(Object.keys(upgraded.economy!.nodes)).toHaveLength(30);
    expect(digest(old)).toBe(before);
    const again=runtime.ensureUpgraded('owner',old,'legacy-source');
    expect(again.worldId).toBe(upgraded.worldId);expect(again.revision).toBe(upgraded.revision);
    runtime.tick();expect(Object.keys(runtime.read('owner')!.combat!.waves)).toHaveLength(0);
  }finally{runtime.close();}
});

it('starts a fresh campaign directly when there is no old world, and preserves a subsequently paused save',()=>{
 const runtime=new VillageRuntime(':memory:',()=>1000,false);try{
  const created=runtime.ensureUpgraded('owner',null,'new');expect(created.paused).toBe(false);
  runtime.setPaused('owner',created.revision,true,created.worldId);
  expect(runtime.ensureUpgraded('owner',null,'new').paused).toBe(true);
 }finally{runtime.close();}
});

it('does not backfill pre-upgrade waves, and still triggers future source waves without fabricated history',()=>{
 const runtime=new VillageRuntime(':memory:',()=>1000,false);try{
  const old=createGame({seed:17});old.elapsed=3377.3;
  const publicState=runtime.ensureUpgraded('owner',old,'source');
  const state=runtime['load']('owner')!;
  state.elapsed=10559.9;state.tick=105599;state.paused=false;
  advanceVillage(state);
  expect(Object.keys(state.combat!.waves)).toEqual(['2']);
  expect(Object.values(state.combat!.enemies)).toHaveLength(5);
  expect(()=>restoreVillageState(state,selectWorldRules('village-v1',publicState.ruleVersion))).not.toThrow();
 }finally{runtime.close();}
});
