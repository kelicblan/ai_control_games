import {expect,it} from 'vitest';
import {VillageRuntime} from '../../scripts/world/village-runtime';
it('keeps original 1x/2x/4x controls authoritative while preserving pause and rejecting unsupported speeds',()=>{
 const runtime=new VillageRuntime(':memory:',()=>1000,false);try{
  let s=runtime.createCampaign('owner',17);expect(s.speed).toBe(1);
  s=runtime.setSpeed('owner',s.revision,4,s.worldId);expect(s.speed).toBe(4);runtime.tick();expect(runtime.read('owner')!.tick).toBe(s.tick);
  s=runtime.setPaused('owner',s.revision,false,s.worldId);runtime.tick();let next=runtime.read('owner')!;expect(next.tick-s.tick).toBe(4);
  s=runtime.setSpeed('owner',next.revision,2,next.worldId);runtime.tick();next=runtime.read('owner')!;expect(next.tick-s.tick).toBe(2);
  expect(()=>runtime.setSpeed('owner',next.revision,3,next.worldId)).toThrow('Invalid village speed');expect(runtime.read('owner')!.speed).toBe(2);
 }finally{runtime.close();}
});
