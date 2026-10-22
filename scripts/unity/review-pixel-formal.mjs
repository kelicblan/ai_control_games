import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {startFormalMap} from '../pixel-world/formal-host.mjs';
import {validateBuild} from '../pixel-world/build-manifest.mjs';
const root=process.cwd(),run=path.join(root,'native/Artifacts/pixel-formal-native-'+Date.now());mkdirSync(run,{recursive:true});
const marker=path.join(run,'connection.json'),data=process.argv[2];if(!data)throw Error('Specify an isolated verified data directory');
const build=validateBuild(root),host=await startFormalMap({root,run,connectionFile:marker,dataDirectory:path.resolve(data),offline:true});
try{const child=spawn(build.executable,['-pixel-world-connection',marker,'-pixel-gameplay-probe',...(process.argv.includes('--verify-debug')?['-pixel-debug-probe']:[]),...(process.argv.includes('--verify-zoom')?['-pixel-zoom-probe']:[]),...(process.argv.includes('--verify-resize')?['-pixel-resize-probe']:[]),...(process.argv.includes('--verify-reset')?['-pixel-reset-probe']:[]),'-pixel-capture-dir',run,'-screen-fullscreen','0','-screen-width','1600','-screen-height','1100','-logFile',path.join(run,'player.log')],{cwd:path.dirname(build.executable),stdio:'ignore'});
 writeFileSync(path.join(run,'launch.json'),JSON.stringify({executable:build.executable,pid:child.pid,database:host.database,sourceHash:build.sourceHash}));console.log(JSON.stringify({run,pid:child.pid,formal:true}));
 await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
}finally{await host.close();}
