import{expect,it}from'vitest';import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import path from'node:path';import{DatabaseSync}from'node:sqlite';import{VillageRuntime}from'../../scripts/world/village-runtime';
it('keeps returned snapshots detached and revalidates externally changed checkpoint bytes',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'village-cache-')),file=path.join(dir,'world.sqlite'),runtime=new VillageRuntime(file,()=>1000,false),db=new DatabaseSync(file);
 try{runtime.create('owner',{id:'cache',worldId:'cache',classification:'experiment',seed:1,actors:[],inventory:{food:10}});const snapshot=runtime.read('owner')!;snapshot.inventory.food=999;expect(runtime.read('owner')!.inventory.food).toBe(10);
 db.prepare('UPDATE village_worlds_v1 SET checksum=? WHERE owner=?').run('0'.repeat(64),'owner');expect(()=>runtime.read('owner')).toThrow('checksum mismatch');
 }finally{runtime.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
