import {readFileSync,writeFileSync} from 'node:fs';import path from 'node:path';import {ensure} from '../../packages/action-runtime/src/json';
const run=path.resolve(process.argv[2]),info=JSON.parse(readFileSync(path.join(run,'processes.json'),'utf8'));ensure((info.database.includes('ts-native-slice-slice-')||info.database.includes('continuous-work-ui-')),'Only isolated acceptance fixtures');const owner=JSON.parse(readFileSync(path.join(path.dirname(info.database),'identity.json'),'utf8')).player;
const headers={'x-camp-tab':'speed-acceptance','x-camp-village-protocol':'1',cookie:`campmind-player=${owner}`};
for(let attempt=0;attempt<390;attempt++){
 const s=await(await fetch(info.endpoint+'/game-api/village',{headers})).json() as any;
 if(!s||typeof s.revision!=='number'){await new Promise(resolve=>setTimeout(resolve,1000));continue;}
 const response=await fetch(info.endpoint+'/game-api/village',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({type:'speed',speed:4,revision:s.revision,worldId:s.worldId})});
 if(response.ok){const after=await response.json() as any;ensure(after.speed===4,'Speed did not apply');const report={success:true,isolatedAcceptanceOnly:true,supportedGameSpeed:4,reason:'Execute the long crafting acceptance through supported simulation speed; do not alter crafting duration or resources',tick:after.tick};writeFileSync(path.join(run,'probe-speed.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));break;}
 ensure(attempt<4,'Speed update conflicted');
}
