import { describe, it, expect } from 'vitest';
import { createGame, advanceGame, issueCommand } from '../src/games/camp/simulation/engine';
import { insideSettlement } from '../src/games/camp/world/settlement';
import { isValidGameState, restoreGameState } from '../src/games/camp/simulation/persistence';
import { ACTIONS, type PolicyFunction } from '../src/games/camp/simulation/types';
import { chooseWildTask, harvestResource } from '../src/games/camp/world/ecology';
import { moveWorldBody, worldCanTraverse } from '../src/games/camp/world/navigation';
import { updateEcology } from '../src/games/camp/world/wildlife';
import {baselinePolicy} from '../src/games/camp/ai/policy';
import {setImmediate as yieldImmediate} from 'node:timers/promises';

const idle: PolicyFunction = () => ({action:'camp',emotion:'calm',source:'rules',latencyMs:0,scores:ACTIONS.map(a=>Number(a==='camp'))});
describe('wilderness ecology', () => {
  it('keeps near-country gathering viable across three days without phantom beast danger accumulating',async()=>{
    let state=createGame({seed:17,difficulty:'cozy'});state.status='playing';
    for(let step=0;step<180;step++){state=advanceGame(state,10,baselinePolicy);if(step%10===9)await yieldImmediate();}
    expect(state.stats.gatheredFood).toBeGreaterThanOrEqual(50);
    expect(state.npcs.filter(n=>n.alive).length).toBeGreaterThanOrEqual(3);
    expect(isValidGameState(state)).toBe(true);
  },120000); // Multi-day ecology replay; bounded slices keep Vitest IPC responsive.
  it('reserves separate patches, only harvests on site, and resumes returning cargo once', () => {
    const state=createGame({seed:17});state.status='playing';
    for(const npc of state.npcs.slice(0,2)){npc.action='food';expect(chooseWildTask(state,npc)).toBe(true);}
    const [npc,other]=state.npcs;
    expect(npc.wildTask!.targetId).not.toBe(other.wildTask!.targetId);
    expect(harvestResource(state,npc)).toBe(0);
    npc.position={...npc.destination};
    const patch=state.world!.ecology!.resources.find(r=>r.id===npc.wildTask!.targetId)!;
    const before=patch.remaining;expect(harvestResource(state,npc)).toBe(4);expect(patch.remaining).toBe(before-4);
    const returning=restoreGameState(JSON.parse(JSON.stringify(state)))!;
    expect(returning).not.toBeNull();
    expect(returning.npcs[0].inventory.food).toBe(4);
    expect(harvestResource(returning,returning.npcs[0])).toBe(0);
  });
  it('walks a real round trip through the gate and bridge without wall/water crossings', () => {
    const state=createGame({seed:17}),npc=state.npcs[0];npc.action='food';chooseWildTask(state,npc);
    const target={...npc.destination},start={...npc.position};let visitedGate=false,visitedBridge=false;
    for(let i=0;i<1000;i++){
      const from={...npc.position},motion=moveWorldBody(npc,target,8,.25,[],17);npc.position=motion.position;
      expect(worldCanTraverse(from,npc.position,17)).toBe(true);
      visitedGate||=Math.abs(npc.position.x-50)<10&&Math.abs(npc.position.y-205)<5;
      visitedBridge||=Math.abs(npc.position.x-50)<6&&Math.abs(npc.position.y-270)<10;
      if(motion.arrived)break;
    }
    expect(Math.hypot(npc.position.x-target.x,npc.position.y-target.y)).toBeLessThan(1);
    expect(visitedGate&&visitedBridge).toBe(true);
    for(let i=0;i<1000;i++){const motion=moveWorldBody(npc,start,8,.25,[],17);npc.position=motion.position;if(motion.arrived)break;}
    expect(Math.hypot(npc.position.x-start.x,npc.position.y-start.y)).toBeLessThan(1);
  },20000);
  it('waits on a closed gate during outward and laden return journeys', () => {
    let state=createGame({seed:17});state.status='playing';const npc=state.npcs[0];npc.action='food';chooseWildTask(state,npc);npc.decisionIn=100;
    state.world!.gateOpen=false;const start={...npc.position};state=advanceGame(state,1,idle);
    expect(state.npcs[0].position).toEqual(start);expect(state.npcs[0].inventory.food).toBe(0);
    const person=state.npcs[0];person.position={x:50,y:310};person.destination={x:32,y:72};person.inventory.food=4;person.wildTask!.phase='return';
    const next=advanceGame(state,1,idle);expect(next.npcs[0].position).toEqual(person.position);expect(next.npcs[0].inventory.food).toBe(4);
  });
  it('retreats from a nearby tiger and moves animals without crossing physical barriers', () => {
    const state=createGame({seed:17});state.status='playing';const npc=state.npcs[0];npc.action='food';chooseWildTask(state,npc);npc.position={...npc.destination};npc.decisionIn=100;
    const tiger=state.world!.ecology!.animals.find(a=>a.species==='tiger')!;tiger.position={x:npc.position.x-35,y:npc.position.y};
    const next=advanceGame(state,.25,idle);expect(next.npcs[0].action).toBe('camp');expect(next.npcs[0].inventory.food).toBe(0);
    for(let tick=1;tick<=40;tick++){const before=state.world!.ecology!.animals.map(a=>({...a.position}));state.elapsed=tick*.5;updateEcology(state);
      state.world!.ecology!.animals.forEach((a,i)=>{if(a.health>0)expect(worldCanTraverse(before[i],a.position,state.seed)).toBe(true);});}
  });
  it('creates abundant plants and four wildlife species outside the palisade', () => {
    const state=createGame({seed:17});
    expect(state.world?.ecology).toBeDefined();
    const ecology=state.world!.ecology!;
    expect(ecology.resources.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ecology.resources.map(r=>r.kind))).toEqual(new Set(['wood','berries','greens','roots','mushrooms']));
    expect(ecology.resources.every(r=>!insideSettlement(r.position.x,r.position.y,12))).toBe(true);
    expect(ecology.animals.filter(a=>a.species==='rabbit').length).toBeGreaterThanOrEqual(18);
    expect(ecology.animals.filter(a=>a.species==='pheasant').length).toBeGreaterThanOrEqual(12);
    expect(ecology.animals.filter(a=>a.species==='boar').length).toBeGreaterThanOrEqual(4);
    expect(ecology.animals.filter(a=>a.species==='tiger')).toHaveLength(1);
    expect(ecology.animals.every(a=>!insideSettlement(a.position.x,a.position.y,12))).toBe(true);
  });
  it('replans legacy village work instead of producing supplies inside the walls', () => {
    const state=createGame({seed:17});state.status='playing';
    const npc=state.npcs[0];npc.position={x:20,y:38};npc.destination={...npc.position};npc.action='wood';npc.progress=.99;npc.actionDuration=1;npc.decisionIn=100;
    const next=advanceGame(state,.25,idle);
    expect(next.npcs[0].inventory.wood).toBe(0);
    expect(next.npcs[0].wildTask).toBeDefined();
    expect(insideSettlement(next.npcs[0].destination.x,next.npcs[0].destination.y)).toBe(false);
  });
  it('persists depletion and animal positions, rejects corrupted ecology, and migrates old saves', () => {
    const state=createGame({seed:17});
    expect(state.world?.ecology).toBeDefined();
    state.world!.ecology!.resources[0].remaining=0;
    state.world!.ecology!.resources[0].readyAt=800;
    const restored=restoreGameState(JSON.parse(JSON.stringify(state)))!;
    expect(restored.world!.ecology).toEqual(state.world!.ecology);
    const damaged=structuredClone(state);damaged.world!.ecology!.resources[0].remaining=-1;
    expect(isValidGameState(damaged)).toBe(false);
    const old=structuredClone(state);delete old.world!.ecology;
    expect(restoreGameState(old)?.world?.ecology).toBeDefined();
  });
  it('offers hunting through an explicit command without expanding model actions', () => {
    const state=createGame({seed:17});state.status='playing';state.npcs[0].energy=100;state.npcs[0].hunger=0;
    const next=issueCommand(state,{type:'hunt',npcId:'azhuang'});
    expect(ACTIONS).toHaveLength(8);
    expect(next.npcs[0].wildTask?.kind).toBe('hunt');
    expect(next.npcs[0].action).toBe('explore');
  });
  it('keeps an explicit hunt through a weather review while physical safety can still interrupt it',()=>{
    let state=createGame({seed:17});state.status='playing';state.npcs[0].energy=100;state.npcs[0].hunger=0;
    state=issueCommand(state,{type:'hunt',npcId:'azhuang'});state=issueCommand(state,{type:'weather',weather:'rain'});
    const next=advanceGame(state,1,idle);expect(next.npcs[0].wildTask?.kind).toBe('hunt');
  });
  it('lets a fit brave hunter face its assigned boar while ordinary gatherers retreat',()=>{
    let state=createGame({seed:17});state.status='playing';state.weatherUntil=10000;state.nextWorldEvent=10000;
    const boar=state.world!.ecology!.animals.find(a=>a.species==='boar')!,npc=state.npcs[0];npc.position={x:boar.position.x+8,y:boar.position.y};npc.health=100;npc.energy=100;npc.hunger=0;
    for(const a of state.world!.ecology!.animals)if(a.id!==boar.id){a.health=0;a.mode='dead';a.respawnAt=2000;}
    state=issueCommand(state,{type:'hunt',npcId:npc.id});expect(state.npcs[0].wildTask?.targetId).toBe(boar.id);
    for(let i=0;i<160&&!state.npcs[0].wildTask?.meat;i++)state=advanceGame(state,.25,idle);
    expect(state.npcs[0].wildTask?.meat).toBe(true);expect(state.npcs[0].health).toBeLessThan(100);
  },15000);
  it('hunts a moving rabbit, preserves the carcass across reload, and delivers meat once', () => {
    let state=createGame({seed:17});state.status='playing';state.weatherUntil=10000;state.nextWorldEvent=10000;
    state.food=90; // Isolate this hunter's delivery accounting from emergency food collectors.
    const rabbit=state.world!.ecology!.animals.find(a=>a.species==='rabbit')!,npc=state.npcs[0];
    npc.position={x:rabbit.position.x+15,y:rabbit.position.y};npc.energy=100;npc.hunger=0;
    state=issueCommand(state,{type:'hunt',npcId:npc.id});
    let carcass=false;
    for(let i=0;i<640&&state.stats.gatheredFood===0;i++){
      state=advanceGame(state,.25,idle);
      if(!carcass&&state.npcs[0].wildTask?.meat){carcass=true;const before=structuredClone(state.world!.ecology!.animals);state=restoreGameState(JSON.parse(JSON.stringify(state)))!;expect(state.world!.ecology!.animals).toEqual(before);}
    }
    expect(carcass).toBe(true);expect(state.stats.gatheredFood).toBe(4);expect(state.npcs[0].inventory.food).toBe(0);
    expect(state.world!.ecology!.animals.some(a=>a.health===0&&a.respawnAt>state.elapsed)).toBe(true);
  },15000);
  it('keeps a moving hunting target from cancelling gate and bridge transit', () => {
    let state=createGame({seed:17});state.status='playing';state.weatherUntil=10000;state.nextWorldEvent=10000;state.npcs[0].energy=100;state.npcs[0].hunger=0;
    state=issueCommand(state,{type:'hunt',npcId:'azhuang'});
    let gate=false,bridge=false;
    for(let i=0;i<720&&state.stats.gatheredFood===0;i++){
      state=advanceGame(state,.25,idle);const p=state.npcs[0].position;
      gate||=Math.abs(p.x-50)<10&&Math.abs(p.y-205)<5;bridge||=Math.abs(p.x-50)<6&&Math.abs(p.y-270)<10;
    }
    expect(gate&&bridge).toBe(true);expect(state.stats.gatheredFood).toBe(4);
  },20000);
  it('resumes an in-flight harvest with identical results and never credits supplies away from storage', () => {
    const state=createGame({seed:17});state.status='playing';state.weatherUntil=10000;state.nextWorldEvent=10000;
    const npc=state.npcs[0];npc.action='food';npc.actionDuration=5;npc.progress=.6;npc.decisionIn=100;chooseWildTask(state,npc);npc.position={...npc.destination};npc.wildTask!.phase='work';
    const loaded=restoreGameState(JSON.parse(JSON.stringify(state)))!;
    expect(advanceGame(loaded,4,idle)).toEqual(advanceGame(state,4,idle));
    const next=advanceGame(state,4,idle);expect(next.npcs[0].inventory.food).toBe(4);expect(next.stats.gatheredFood).toBe(0);
  });
  it('rejects a stale ecology clock rather than doing unbounded synchronous replay', () => {
    const state=createGame({seed:17});state.elapsed=1e9;
    expect(isValidGameState(state)).toBe(false);
  });
  it('does not hunt through a solid trunk even when the target is within throwing range', () => {
    let state=createGame({seed:17});state.status='playing';state.weatherUntil=10000;state.nextWorldEvent=10000;
    const site=state.world!.ecology!.resources.find(r=>r.kind==='wood')!,rabbit=state.world!.ecology!.animals.find(a=>a.species==='rabbit')!,npc=state.npcs[0];
    npc.position={x:site.position.x-3,y:site.position.y};rabbit.position={x:site.position.x+3,y:site.position.y};
    npc.action='explore';npc.actionDuration=.1;npc.progress=.99;npc.decisionIn=100;npc.wildTask={kind:'hunt',targetId:rabbit.id,label:'兔子',phase:'work',startedAt:0,stalledFor:0,meat:false};
    state=advanceGame(state,.25,idle);expect(state.npcs[0].inventory.food).toBe(0);expect(state.world!.ecology!.animals[0].health).toBeGreaterThan(0);
  });
  it('preserves bounded harvest-tree contact history and rejects nonexistent resource IDs',()=>{
    const state=createGame({seed:17});state.elapsed=2;state.world!.ecology!.updatedAt=2;
    const npc=state.npcs[0];npc.collision={hurtUntil:0,reactionUntil:3,objectCooldowns:{'harvest-wood-0':3},lastHit:{kind:'bump',objectId:'harvest-wood-0',time:1,intensity:.16,damage:0}};
    expect(isValidGameState(state)).toBe(true);expect(restoreGameState(state)).not.toBeNull();
    npc.collision.lastHit!.objectId='harvest-wood-24';expect(isValidGameState(state)).toBe(false);
  });
});
