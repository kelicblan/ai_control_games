import test from 'node:test';
import assert from 'node:assert/strict';
process.env.CAMP_WORLD_LAYOUT='pixel-world-v1';process.env.CAMP_VILLAGE_DEFAULT='1';process.env.CAMP_VILLAGE_EXPERIMENTAL='1';
const {VillageRuntime}=await import('../../scripts/world/village-runtime.ts');
test('held movement survives modest host delays, while release, pause and stale generation stop movement',t=>{
 let now=1000;const runtime=new VillageRuntime(':memory:',()=>now,false);t.after(()=>runtime.close());
 let state=runtime.createCampaign('input-owner',64138);state=runtime.setPaused('input-owner',state.revision,false,state.worldId);
 const position=()=>runtime.read('input-owner').actors.player.position;
 const before=position();runtime.setPixelInput('input-owner',{x:1,y:0},state.worldId);now+=400;runtime.tick();const moved=position();assert.ok(moved.x>before.x+.4);
 runtime.setPixelInput('input-owner',{x:0,y:0},state.worldId);now+=100;runtime.tick();assert.deepEqual(position(),moved);
 assert.throws(()=>runtime.setPixelInput('input-owner',{x:1,y:0},'old-world'),/地图世界已变化/);
 runtime.setPixelInput('input-owner',{x:1,y:0},state.worldId);now+=1001;runtime.tick();assert.deepEqual(position(),moved);
 state=runtime.read('input-owner');runtime.setPaused('input-owner',state.revision,true,state.worldId);runtime.setPixelInput('input-owner',{x:1,y:0},state.worldId);now+=100;runtime.tick();assert.deepEqual(position(),moved);
 const read=runtime.read;runtime.read=()=>{throw Error('input must not rebuild the public snapshot');};assert.doesNotThrow(()=>runtime.setPixelInput('input-owner',{x:0,y:0},state.worldId));runtime.read=read;
});
