import {readFileSync,existsSync} from 'node:fs';
for(const run of process.argv.slice(2)){
 if(!/^slice-[a-f0-9-]+$/.test(run))throw new Error('Explicit native probe id required');
 const root='native/Artifacts/'+run;
 for(const name of ['village-result.json','animal-result.json','launcher-result.json','processes.json'])if(existsSync(root+'/'+name)){
  const s=JSON.parse(readFileSync(root+'/'+name,'utf8'));console.log(JSON.stringify({run,name,...(name==='processes.json'?s:{success:s.success,error:s.error,coverage:s.coverage,huntUiVerified:s.huntUiVerified,worldId:s.worldId})}));
 }
}
