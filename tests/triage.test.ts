import {describe,it,expect} from 'vitest';
import {createGame,issueCommand} from '../src/games/camp/simulation/engine';
import {canRescue} from '../src/games/camp/simulation/triage';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WorldRuntime} from '../scripts/world/runtime';
import {baselinePolicy} from '../src/games/camp/ai/policy';

describe('living critical companion rescue',()=>{
 it('accepts the server command, deduplicates it and persists rescue without reviving the dead',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'camp-triage-')),file=path.join(directory,'world.sqlite');
  let runtime=new WorldRuntime(file,baselinePolicy,()=>100000);
  try{
   const state=createGame();state.status='paused';state.food=4;state.npcs[0].health=10;Object.assign(state.npcs[1],{alive:false,health:0});
   const first=runtime.mutate('triage-player',0,'seed',{type:'import',state},'tab');
   const action={type:'command' as const,command:{type:'rescue' as const,npcId:state.npcs[0].id}};
   const rescued=runtime.mutate('triage-player',first.revision,'rescue-once',action,'tab');
   expect(rescued.state!.food).toBe(2);expect(rescued.state!.npcs[0].health).toBe(40);
   expect(runtime.mutate('triage-player',first.revision,'rescue-once',action,'tab').state!.food).toBe(2);
   runtime.close();runtime=new WorldRuntime(file,baselinePolicy,()=>100000);
   expect(runtime.read('triage-player').state!.npcs[0].health).toBe(40);expect(runtime.read('triage-player').state!.npcs[1].alive).toBe(false);
  }finally{runtime.close();rmSync(directory,{recursive:true,force:true});}
 });
 it('spends food once to stabilize a living companion and preserves the original state',()=>{
  const state=createGame();state.status='paused';state.food=2;const npc=state.npcs[0];npc.health=10;npc.hunger=100;npc.energy=2;npc.injured=true;
  const next=issueCommand(state,{type:'rescue',npcId:npc.id});
  expect(next.food).toBe(0);expect(next.npcs[0]).toMatchObject({alive:true,health:40,hunger:55,energy:25,injured:false});
  expect(state.npcs[0].health).toBe(10);expect(issueCommand(next,{type:'rescue',npcId:npc.id}).stats.helps).toBe(next.stats.helps);
 });
 it('never resurrects dead or zero-health companions and never overdrafts food',()=>{
  for(const [alive,health,food] of [[false,0,4],[true,0,4],[true,12,1],[true,60,4]] as const){
   const state=createGame();state.status='paused';state.food=food;Object.assign(state.npcs[0],{alive,health});
   const next=issueCommand(state,{type:'rescue',npcId:state.npcs[0].id});
   expect(next.food).toBe(food);expect(next.npcs[0].health).toBe(health);expect(next.npcs[0].alive).toBe(alive);
  }
  expect(canRescue({alive:false,health:20})).toBe(false);
 });
});
