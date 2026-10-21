import { expect,it } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import path from 'node:path';
import { VillageRuntime } from '../../scripts/world/village-runtime';
it('persists restart backlog and processes it with bounded authoritative steps',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'village-catchup-')),file=path.join(dir,'world.sqlite');let now=1000;
 let runtime=new VillageRuntime(file,()=>now,true);
 try{runtime.create('owner',{id:'catchup',worldId:'catchup',classification:'experiment',ruleVersion:'p4-social-content-v1',seed:1,actors:[],inventory:{food:10}});runtime.setPaused('owner',0,false);runtime.close();now+=1200;runtime=new VillageRuntime(file,()=>now,true);
  const snapshot=runtime.read('owner')!;expect(snapshot.catchupTicks).toBe(12);runtime.tick();const done=runtime.read('owner')!;expect(done.catchupTicks).toBe(0);expect(done.tick).toBe(13);expect(done.elapsed).toBe(1.3);
 }finally{runtime.close();rmSync(dir,{recursive:true,force:true});}
});
