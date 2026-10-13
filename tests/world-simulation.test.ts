import { describe, expect, it } from 'vitest';
import { ExplorationMap, MAX_COORDINATE } from '../packages/world-core/src';
import { createGame, advanceGame, issueCommand } from '../src/games/camp/simulation/engine';
import { isValidGameState, loadGameWithStatus, saveGame, SAVE_KEY } from '../src/games/camp/simulation/persistence';
import { worldCanTraverse } from '../src/games/camp/world/navigation';
import { createWorldState, updateWorldExploration } from '../src/games/camp/world/state';
import type { GameState, PolicyFunction } from '../src/games/camp/simulation/types';

const idle: PolicyFunction = () => ({action:'camp',emotion:'calm',scores:[0,0,0,0,0,0,1,0],source:'rules',latencyMs:0});
function storage() {
  const data=new Map<string,string>();
  return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
}
function travelling(): GameState {
  const state=createGame({seed:17}); state.status='playing';
  state.npcs.forEach(n=>{n.action=null;n.decisionIn=100;n.destination={...n.position};});
  state.npcs[0].position={x:-60,y:50};state.npcs[0].destination={x:-60,y:50};
  return state;
}
describe('权威世界与兼容存档',()=>{
  it('新局1000米圆外未知，角色而非相机揭开黑雾',()=>{
    const state=createGame({seed:17}), world=createWorldState(state.seed);
    let map=ExplorationMap.restore(world.exploration);
    expect(map.isExplored({x:1050,y:55})).toBe(true);
    expect(map.isExplored({x:1050.1,y:55})).toBe(false);
    state.world=world;state.npcs[0].position={x:-1100,y:55};
    const before=JSON.stringify(state.world);map.visibility({x:-1100,y:55},[]);
    expect(JSON.stringify(state.world)).toBe(before);
    updateWorldExploration(state);map=ExplorationMap.restore(state.world!.exploration);
    expect(map.isExplored({x:-1100,y:55})).toBe(true);
    expect(map.isExplored({x:-1400,y:55})).toBe(false);
  });
  it('移动指令与模拟不把负坐标或百米外的角色裁回旧地图',()=>{
    let state=travelling();state=issueCommand(state,{type:'move',npcId:'azhuang',target:{x:-100,y:50}});
    expect(state.npcs[0].manualTarget).toEqual({x:-100,y:50});
    state=advanceGame(state,.25,idle);
    expect(state.npcs[0].position.x).toBeLessThan(-60);
    expect(state.npcs[0].destination.x).toBe(-100);
    expect(isValidGameState(state)).toBe(true);
    const same=issueCommand(state,{type:'move',npcId:'azhuang',target:{x:MAX_COORDINATE*2,y:0}});
    expect(same.npcs[0].manualTarget).toEqual(state.npcs[0].manualTarget);
  });
  it('跨越一公里后保存与恢复探索位图、人物位置和种子',()=>{
    const state=createGame({seed:17}), store=storage();state.status='paused';
    state.npcs[0].position={x:-1100,y:55};state.npcs[0].destination={x:-1100,y:55};
    updateWorldExploration(state);
    expect(saveGame(state,store)).toBe(true);
    const restored=loadGameWithStatus(store);
    expect(restored.status).toBe('restored');
    expect(restored.state!.npcs[0].position).toEqual(state.npcs[0].position);
    expect(restored.state!.world).toEqual(state.world);
    expect(ExplorationMap.restore(restored.state!.world!.exploration).isExplored({x:-1100,y:55})).toBe(true);
  });
  it('旧五人存档显式补世界，不重置身体状态和社交历史',()=>{
    const state=createGame({seed:17}),store=storage();delete state.world;
    state.npcs[0].health=61;state.status='paused';
    store.setItem(SAVE_KEY,JSON.stringify({version:1,savedAt:1,state}));
    const restored=loadGameWithStatus(store);
    expect(restored.status).toBe('restored');expect(restored.state!.npcs[0].health).toBe(61);
    expect(restored.state!.social).toEqual(state.social);
    expect(restored.state!.world!.exploration.initialRadius).toBe(1000);
  });
  it('暂停不揭雾，实际模拟推进后写入新增探索并保留离屏营地运行',()=>{
    let state=travelling();
    // 在边界外选一条确实可通行的短路段，不让随机树林影响测试意图。
    let y=200;
    while(y<500&&!worldCanTraverse({x:-1100,y},{x:-1110,y},17))y+=10;
    expect(y).toBeLessThan(500);
    state.npcs[0].position={x:-1100,y};state.npcs[0].destination={x:-1100,y};
    state=issueCommand(state,{type:'move',npcId:'azhuang',target:{x:-1110,y}});
    state.status='paused';const paused=advanceGame(state,.25,idle);
    expect(paused.world!.revision).toBe(0);
    const fire=paused.fire;state=advanceGame({...paused,status:'playing'},.25,idle);
    expect(state.npcs[0].position.x).toBeLessThan(-1100);
    expect(ExplorationMap.restore(state.world!.exploration).isExplored(state.npcs[0].position)).toBe(true);
    expect(state.fire).not.toBe(fire);
    expect(isValidGameState(state)).toBe(true);
  });
  it('未来生成器存档标记为不支持，不能删除或重新生成',()=>{
    const state=createGame({seed:17}),store=storage();state.world=createWorldState(17);
    state.world.exploration.generatorVersion=2;
    const raw=JSON.stringify({version:1,savedAt:1,state});store.setItem(SAVE_KEY,raw);
    expect(loadGameWithStatus(store).status).toBe('unsupported');
    expect(store.getItem(SAVE_KEY)).toBe(raw);
  });
});
