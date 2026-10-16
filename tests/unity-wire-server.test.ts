import { fork, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const root=process.cwd(),run=mkdtempSync(path.join(root,'native/Artifacts/wire-')),database=path.join(run,'world.sqlite'),player=randomUUID();
let child:ChildProcess|undefined,endpoint='';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function stop(){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const owned=child,exited=new Promise<void>(resolve=>owned.once('exit',()=>resolve()));
  if(owned.connected)owned.send({type:'campmind-stop'});await Promise.race([exited,delay(8000)]);
  if(owned.exitCode===null&&owned.signalCode===null){owned.kill();await exited;}
}
async function start(){
  const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));endpoint=`http://127.0.0.1:${port}`;
  child=fork(path.join(root,'scripts/world/server.ts'),[],{cwd:root,execArgv:['--import','tsx'],windowsHide:true,silent:true,env:{...process.env,CAMP_WORLD_PORT:String(port),CAMP_WORLD_DB:database,CAMP_SOCIAL_OFFLINE:'1'}});
  const log=createWriteStream(path.join(run,`server-${port}.log`));child.stdout!.pipe(log,{end:false});child.stderr!.pipe(log,{end:false});child.once('exit',()=>log.end());
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){if(child.exitCode!==null||child.signalCode!==null)throw new Error(`Owned wire server exited; see ${run}`);try{const response=await fetch(endpoint+'/game-api/health',{signal:AbortSignal.timeout(1000)});if(response.ok){const health=await response.json();expect(path.resolve(health.root)).toBe(root);return;}}catch{}await delay(100);}
  throw new Error(`Owned wire server not ready; see ${run}`);
}
const headers={'Cookie':`campmind-player=${player}`,'X-Camp-Tab':'native-wire-test','X-Camp-Native-Protocol':'1'};
async function read(){const response=await fetch(endpoint+'/game-api/world',{headers,signal:AbortSignal.timeout(5000)});expect(response.status).toBe(200);return response.json();}
async function post(body:unknown,version='1'){return fetch(endpoint+'/game-api/world',{method:'POST',headers:{...headers,'X-Camp-Native-Protocol':version,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});}
async function mutate(action:unknown,operation=randomUUID()){
  for(let attempt=0;attempt<4;attempt++){const current=await read(),response=await post({revision:current.revision,operation,action});if(response.status===409)continue;expect(response.status).toBe(200);return response.json();}
  throw new Error('Unresolved test-world revision race');
}
describe('actual isolated native world HTTP boundaries',()=>{
  beforeAll(start,25000);afterAll(stop,12000);
  it('rejects unknown versions, deduplicates resources, rejects409 and survives disconnect/restart',async()=>{
    let current=await read();expect(current.schemaVersion).toBe(1);expect(current.state).toBeNull();
    const unsupported=await post({revision:0,operation:'must-not-start',action:{type:'start',options:{seed:17,mode:'rules'}}},'999');expect(unsupported.status).toBe(426);expect((await unsupported.json()).code).toBe('UNSUPPORTED_NATIVE_PROTOCOL');expect((await read()).state).toBeNull();
    const legacy=await fetch(endpoint+'/game-api/world',{headers:{Cookie:headers.Cookie}});expect((await legacy.json()).schemaVersion).toBeUndefined();
    await mutate({type:'start',options:{seed:17,mode:'rules'}});await mutate({type:'pause',paused:true});await mutate({type:'agency-settings',enabled:true,cognition:false,modelId:'minimind3'});
    const before=await read(),operation=randomUUID();current=await mutate({type:'command',command:{type:'feed',npcId:'azhuang'}},operation);expect(current.state.food).toBeLessThan(before.state.food);
    const duplicate=await post({revision:0,operation,action:{type:'command',command:{type:'feed',npcId:'azhuang'}}});expect(duplicate.status).toBe(200);expect((await duplicate.json()).state.food).toBe(current.state.food);
    const stale=await post({revision:0,operation:randomUUID(),action:{type:'command',command:{type:'feed',npcId:'azhuang'}}});expect(stale.status).toBe(409);expect((await stale.json()).code).toBe('REVISION_CONFLICT');expect((await read()).state.food).toBe(current.state.food);
    const scope=current.dialogueScope,food=current.state.food;await stop();await expect(fetch(endpoint+'/game-api/world',{headers,signal:AbortSignal.timeout(1000)})).rejects.toThrow();await start();current=await read();expect(current.dialogueScope).toBe(scope);expect(current.state.food).toBe(food);expect(current.state.status).toBe('paused');
    current=await mutate({type:'reset'});expect(current.dialogueScope).not.toBe(scope);
  },45000);
});
