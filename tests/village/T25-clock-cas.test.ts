import{expect,it}from'vitest';import{VillageRuntime}from'../../scripts/world/village-runtime';
it('accepts an unchanged entity read set across clock-only revisions, while pinning the world and retaining strict legacy CAS',()=>{
 const runtime=new VillageRuntime(':memory:',()=>1000,false);try{
 runtime.create('owner',{id:'cas',worldId:'cas',classification:'experiment',ruleVersion:'p4-social-content-v1',seed:1,actors:[],inventory:{food:10}});runtime.setPaused('owner',0,false);runtime.tick();const basis=runtime.read('owner')!;runtime.tick();
 const command={operationId:'rest',actorId:'player',issuedAtTick:basis.tick,action:'REST',parameters:{seconds:1},readSet:{'actor:player':basis.versions['actor:player'],'inventory:public':basis.versions['inventory:public']},source:'player_input'as const};
 expect(()=>runtime.command('owner',basis.revision,command,'other-world')).toThrow('world changed');expect(runtime.command('owner',basis.revision,command,'cas').accepted).toBe(true);
 expect(()=>runtime.command('owner',basis.revision,command,'other-world')).toThrow('world changed');
 expect(()=>runtime.command('owner',basis.revision,{...command,operationId:'stale',readSet:{'actor:player':99}},'cas')).toThrow('entities changed');
 const current=runtime.read('owner')!;runtime.tick();expect(runtime.setPaused('owner',current.revision,true,'cas').paused).toBe(true);
 runtime.create('legacy',{id:'legacy',worldId:'legacy',classification:'experiment',ruleVersion:'p2-life-alpha-v1',seed:1,actors:[],inventory:{food:10}});runtime.setPaused('legacy',0,false);expect(()=>runtime.setPaused('legacy',0,true)).toThrow('revision conflict');
 }finally{runtime.close();}
});
