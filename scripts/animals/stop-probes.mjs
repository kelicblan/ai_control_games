import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import path from 'node:path';
for(const run of process.argv.slice(2)){
 if(!/^slice-[a-f0-9-]+$/.test(run))throw new Error('Explicit owned probe required');
 const s=JSON.parse(readFileSync('native/Artifacts/'+run+'/processes.json','utf8'));
 const db=path.resolve(s.database);if(!db.startsWith(path.resolve('native/LocalData')+path.sep)||db===path.resolve('native/LocalData/new-world-v1/world.sqlite'))throw new Error('Never stop the primary game');
 const current=execFileSync('tasklist.exe',['/FI',`PID eq ${s.player}`,'/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true});
 if(current.toLowerCase().startsWith('"campmind.exe",')){process.kill(s.player);console.log(JSON.stringify({run,stoppedOwnedTestPlayer:s.player}));}
}
