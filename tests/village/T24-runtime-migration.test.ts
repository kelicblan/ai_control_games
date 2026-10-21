import{expect,it}from'vitest';import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import path from'node:path';import{DatabaseSync}from'node:sqlite';
import{VillageRuntime}from'../../scripts/world/village-runtime';import{createGame}from'../../src/games/camp/simulation/engine';import{digest}from'../../packages/action-runtime/src/json';
it('rolls back a failed archive write and never overwrites an existing new world or the source',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'village-migration-')),file=path.join(dir,'world.sqlite'),runtime=new VillageRuntime(file,()=>1000,false),db=new DatabaseSync(file);
 try{
  const old=createGame({seed:17}),hash=digest(old),mapping={sourceWorldId:'legacy',actors:Object.fromEntries(old.npcs.map(n=>[n.id,'W001'])),acknowledgeArchive:true};
  db.exec("CREATE TRIGGER fail_archive BEFORE INSERT ON village_migration_v1 BEGIN SELECT RAISE(ABORT,'disk write rejected'); END;");
  expect(()=>runtime.migrateLegacy('owner',old,mapping,hash)).toThrow('disk write rejected');expect(runtime.read('owner')).toBeNull();expect(db.prepare('SELECT COUNT(*) AS n FROM village_worlds_v1').get()!.n).toBe(0);
  db.exec('DROP TRIGGER fail_archive');const world=runtime.migrateLegacy('owner',old,mapping,hash);expect(world!.paused).toBe(true);expect(digest(old)).toBe(hash);
  expect(()=>runtime.migrateLegacy('owner',old,mapping,hash)).toThrow('already exists');const audit=db.prepare('SELECT payload,checksum FROM village_migration_v1').get()!;expect(digest(JSON.parse(audit.payload as string))).toBe(audit.checksum);expect(digest(JSON.parse(audit.payload as string).sourceArchive)).toBe(hash);
 }finally{runtime.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
