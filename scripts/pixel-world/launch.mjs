/** 唯一默认游戏启动器。新EXE未生成或过期就报错，绝不偷偷启动旧3D包。 */
import {spawn} from 'node:child_process';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startMapServer} from './server.mjs';
import {validateBuild} from './build-manifest.mjs';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function launchGame({root=repository,spawnPlayer=spawn}={}){
 const build=validateBuild(root),run=path.join(root,'native/Artifacts/pixel-game-'+randomUUID());mkdirSync(run,{recursive:true});
 const connectionFile=path.join(run,'connection.json'),database=path.join(root,'native/LocalData/pixel-world-v1/world.sqlite');
 if(existsSync(path.join(root,'native/LocalData/new-world-v1/world.sqlite')))console.log('旧玩法存档保留在原目录；本二维地图首版尚未迁移NPC、生产与旧存档。');
 const host=await startMapServer({database,connectionFile});let child,exited,watch,stopPromise,stopping=false;
 const stop=()=>{
  if(stopPromise)return stopPromise;stopping=true;
  stopPromise=(async()=>{
  // 只结束本次持有的子进程；没有按名称批量杀进程，也不关闭其他世界服务。
  if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await Promise.race([exited.catch(()=>{}),delay(5000)]);}
  await host.close();
  })();return stopPromise;
 };
 const signal=()=>void stop();process.once('SIGINT',signal);process.once('SIGTERM',signal);
 try{
  child=spawnPlayer(build.executable,['-pixel-world-connection',connectionFile,'-logFile',path.join(run,'player.log')],{cwd:path.dirname(build.executable),windowsHide:false,stdio:'ignore'});
  exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  watch=setInterval(()=>{if(host.closed&&!stopping)void stop();},250);
  console.log('正在启动默认二维游戏。地图阶段：NPC、MLP、生产与社会化尚未接入。');
  writeFileSync(path.join(run,'launch.json'),JSON.stringify({kind:build.kind,executable:build.executable,database,pid:child.pid??null,sourceHash:build.sourceHash,runtimeValidated:false}));
  const result=await exited;if(result.code!==0&&!stopping)throw new Error('二维客户端异常退出：'+(result.code??result.signal)+'；日志：'+run);
  return{run,database,code:result.code,stopped:stopping};
 }finally{clearInterval(watch);process.removeListener('SIGINT',signal);process.removeListener('SIGTERM',signal);await stop();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.platform!=='win32')throw new Error('默认客户端为Windows Unity游戏；请在项目指定Windows构建机运行。');await launchGame();}
 catch(error){console.error(error.message);process.exitCode=1;}
}
