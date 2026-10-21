import {afterEach,expect,test,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
let folder='';
test('fine stair surface heights avoid coarse-grid false ledges without bypassing collision',async()=>{
 folder=mkdtempSync(path.join(tmpdir(),'camp-stair-'));const file=path.join(folder,'map.json'),width=21,height=21,heights=Array(width*height).fill(0),walkable=Array(width*height).fill(1);for(let y=0;y<height;y++)for(let x=0;x<width;x++)heights[y*width+x]=x*.5;
 const data={version:1,id:'new-world-v1',minX:0,minY:0,step:.5,width,height,heights,walkable,spawn:{x:2,y:5},center:{x:2,y:5},gate:{x:9,y:9},locations:{},npcSpawns:[],restPoints:[],outline:[],stairRepair:{bottom:{x:2,y:5},top:{x:8,y:5},halfWidth:1,profile:[2,3,4,5,6,7,8]}};writeFileSync(file,JSON.stringify(data));vi.stubEnv('CAMP_WORLD_LAYOUT','new-world-v1');vi.stubEnv('CAMP_NEW_WORLD_DATA',file);vi.resetModules();const p=await import('../src/games/camp/world/newWorldProfile');
 expect(p.newWorldHeight({x:2.2,y:5})).toBeCloseTo(2.2);expect(p.newWorldTraverse({x:2,y:5},{x:8,y:5})).toBe(true);expect(p.newWorldTraverse({x:2,y:7},{x:8,y:7})).toBe(false);p.newWorld!.walkable[10*width+10]=0;expect(p.newWorldTraverse({x:2,y:5},{x:8,y:5})).toBe(false);
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();if(folder)rmSync(folder,{recursive:true,force:true});});
test('scene collision export blocks water, steep ledges, closed gate and repairs invalid spawns',async()=>{
 folder=mkdtempSync(path.join(tmpdir(),'camp-map-'));const file=path.join(folder,'map.json');const width=21,height=21;const heights=Array(width*height).fill(0),walkable=Array(width*height).fill(1);for(let y=0;y<height;y++)walkable[y*width+10]=0;walkable[10*width+10]=1;heights[3*width+3]=4;
 writeFileSync(file,JSON.stringify({version:1,id:'new-world-v1',minX:0,minY:0,step:.5,width,height,heights,walkable,spawn:{x:2,y:2},center:{x:2,y:2},gate:{x:5,y:5},locations:{},npcSpawns:[],restPoints:[],outline:[]}));vi.stubEnv('CAMP_WORLD_LAYOUT','new-world-v1');vi.stubEnv('CAMP_NEW_WORLD_DATA',file);vi.resetModules();const p=await import('../src/games/camp/world/newWorldProfile');
 expect(p.newWorldTraverse({x:4,y:2},{x:6,y:2})).toBe(false);expect(p.newWorldTraverse({x:4,y:5},{x:6,y:5})).toBe(true);expect(p.newWorldTraverse({x:4,y:5},{x:6,y:5},false)).toBe(false);expect(p.newWorldTraverse({x:1,y:1.5},{x:1.5,y:1.5})).toBe(false);expect(p.newWorldWalkable(p.newWorldProject({x:5,y:2}))).toBe(true);expect(p.newWorldTraverse({x:NaN,y:0},{x:0,y:0})).toBe(false);
});

test('actual exported stairs remain supported after crossing the original platform seam',async()=>{
 vi.stubEnv('CAMP_WORLD_LAYOUT','new-world-v1');vi.stubEnv('CAMP_NEW_WORLD_DATA',path.resolve('native/ArtSource/new-world-runtime.json'));vi.resetModules();const p=await import('../src/games/camp/world/newWorldProfile');const m=p.newWorld as typeof p.newWorld&{stairRepair:{bottom:{x:number;y:number};top:{x:number;y:number};meshTop:{x:number;y:number}}};const s=m!.stairRepair,dx=s.top.x-s.bottom.x,dy=s.top.y-s.bottom.y,length=Math.hypot(dx,dy),after={x:s.meshTop.x+dx/length*.05,y:s.meshTop.y+dy/length*.05};expect(p.newWorldTraverse(s.bottom,s.top)).toBe(true);expect(p.newWorldWalkable(after)).toBe(true);expect(p.newWorldHeight(after)).toBeGreaterThan(p.newWorldHeight(s.meshTop)-.4);
});

test('real new-map simulation remains restorable with bounded partial routes',async()=>{
 vi.stubEnv('CAMP_WORLD_LAYOUT','new-world-v1');vi.stubEnv('CAMP_NEW_WORLD_DATA',path.resolve('native/ArtSource/new-world-runtime.json'));vi.resetModules();
 const {createGame,advanceGameSteps}=await import('../src/games/camp/simulation/engine');const {baselinePolicy}=await import('../src/games/camp/ai/policy');const {restoreGameState}=await import('../src/games/camp/simulation/persistence');
 let state=createGame({seed:17,mode:'rules'});state.status='playing';for(let i=0;i<20;i++){state=advanceGameSteps(state,5,baselinePolicy);expect(state.npcs.every(n=>!n.worldRoute||n.worldRoute.waypoints.length<=128)).toBe(true);expect(restoreGameState(state)).not.toBeNull();}
 expect(state.elapsed).toBeCloseTo(10);expect(state.npcs).toHaveLength(9);
},20000);

test('an unreachable destination waits before retrying and retries after its cooldown',async()=>{
 folder=mkdtempSync(path.join(tmpdir(),'camp-retry-'));const file=path.join(folder,'map.json');const width=21,height=21,walkable=Array(width*height).fill(1);for(let y=0;y<height;y++)walkable[y*width+10]=0;
 writeFileSync(file,JSON.stringify({version:1,id:'new-world-v1',minX:0,minY:0,step:.5,width,height,heights:Array(width*height).fill(0),walkable,spawn:{x:2,y:2},center:{x:2,y:2},gate:{x:5,y:5},locations:{},npcSpawns:[],restPoints:[],outline:[]}));vi.stubEnv('CAMP_WORLD_LAYOUT','new-world-v1');vi.stubEnv('CAMP_NEW_WORLD_DATA',file);vi.resetModules();const p=await import('../src/games/camp/world/newWorldProfile');
 const actor={id:'azhuang',alive:true,position:{x:4.5,y:2}} as import('../src/games/camp/simulation/types').Npc;const target={x:5.5,y:2};
 p.newWorldMove(actor,target,3,.1,[]);const first=actor.worldRoute;expect(first?.waypoints).toHaveLength(0);
 for(let i=0;i<10;i++){const result=p.newWorldMove(actor,target,3,.1,[]);expect(result.position).toEqual(actor.position);expect(actor.worldRoute).toBe(first);}
 for(let i=0;i<15;i++)p.newWorldMove(actor,target,3,.1,[]);expect(actor.worldRoute).not.toBe(first);
});
