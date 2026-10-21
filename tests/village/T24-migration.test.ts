import{expect,it}from'vitest';import{createGame}from'../../src/games/camp/simulation/engine';import{digest}from'../../packages/action-runtime/src/json';import{previewMigration,migrateToNewWorld}from'../../src/games/camp/village/domain/migration';import{selectWorldRules}from'../../src/games/camp/village/config/load';import{restoreVillageState}from'../../src/games/camp/village/domain/state';
it('previews missing prototypes and clones phase progress without overwriting old facts or adding resources',()=>{
 const legacy=createGame({seed:17});legacy.elapsed=500;legacy.wood=12.75;legacy.food=3;const before=digest(legacy);
 expect(previewMigration(legacy,{sourceWorldId:'old',actors:{},acknowledgeArchive:false}).blockers.length).toBeGreaterThan(0);
 const mappings={sourceWorldId:'old',actors:Object.fromEntries(legacy.npcs.map(n=>[n.id,'W001'])),acknowledgeArchive:true};const result=migrateToNewWorld(legacy,mappings,'migrated',before);
 expect(result.world.elapsed).toBe(586.7);expect(result.world.inventory).toMatchObject({wood:12,food:3,stone:0,rope:0,meat:0});expect(result.audit.sourceHash).toBe(before);expect(digest(result.audit.sourceArchive)).toBe(before);expect(digest(legacy)).toBe(before);
 expect(()=>restoreVillageState(result.world,selectWorldRules('village-v1','p4-social-content-v1'))).not.toThrow();expect(()=>migrateToNewWorld({...legacy,version:2},mappings,'other',before)).toThrow();
});
