import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {tsImport} from 'tsx/esm/api';
const {digest}=await tsImport('../../packages/action-runtime/src/json.ts',import.meta.url);
const root=path.resolve(import.meta.dirname,'../..');
const source=path.join(root,'native/LocalData/editor-new-world-v1');
const target=path.join(root,'native/LocalData/free-camera-controls',randomUUID());
fs.mkdirSync(target,{recursive:true});
const original=new DatabaseSync(path.join(source,'world.sqlite'),{readOnly:true});
try{await backup(original,path.join(target,'world.sqlite'));}finally{original.close();}
fs.copyFileSync(path.join(source,'identity.json'),path.join(target,'identity.json'));
const fixture=new DatabaseSync(path.join(target,'world.sqlite'));
try{for(const row of fixture.prepare('SELECT owner,payload FROM village_worlds_v1').all()){
 const state=JSON.parse(row.payload);state.catchupTicks=0;state.paused=false;
 fixture.prepare('UPDATE village_worlds_v1 SET payload=?,checksum=? WHERE owner=?').run(JSON.stringify(state),digest(state),row.owner);
}fixture.prepare('UPDATE village_runtime_clock_v1 SET last_wall_ms=?').run(Date.now());}finally{fixture.close();}
fs.mkdirSync(path.join(root,'native/Artifacts/free-camera-controls'),{recursive:true});
fs.writeFileSync(path.join(root,'native/Artifacts/free-camera-controls/fixture.json'),JSON.stringify({dataDirectory:target,sourceReadOnly:true,offlineReplayDisabledOnlyInFixture:true},null,2));
console.log(JSON.stringify({prepared:true,dataDirectory:target}));
