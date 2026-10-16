import { fork, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

const root = process.cwd();
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server,'listening');
  const port = (server.address() as {port:number}).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function waitFor(check: () => Promise<boolean>, output: () => string) {
  for(let i=0;i<150;i++) { try { if(await check()) return; } catch { /* starting */ } await new Promise(resolve=>setTimeout(resolve,100)); }
  throw new Error(`Timed out: ${output()}`);
}
it('starts web and world together, stops both through one command, and supports a fresh restart', async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'campmind-runner-'));
  const port=await freePort(),worldPort=await freePort(),session=`test-${process.pid}`;
  const file=path.join(root,'data',`local-game-${session}.json`),dbFile=path.join(dir,'world.sqlite');
  let child:ChildProcess|undefined,output='';
  const launch=()=>{
    child=fork(path.join(root,'scripts/local-game.ts'),['start',`--port=${port}`,`--world-port=${worldPort}`,`--session=${session}`],{
      execArgv:['--import','tsx'],windowsHide:true,silent:true,env:{...process.env,CAMP_WORLD_DB:dbFile},
    });
    child.stdout?.on('data',chunk=>{output+=String(chunk);}); child.stderr?.on('data',chunk=>{output+=String(chunk);});
  };
  const stop=async()=>{
    const exited=once(child!,'exit');
    const stopper=fork(path.join(root,'scripts/local-game.ts'),['stop',`--session=${session}`],{execArgv:['--import','tsx'],windowsHide:true,silent:true});
    const [code]=await once(stopper,'exit'); expect(code,output).toBe(0);
    expect((await exited)[0],output).toBe(0);
    expect(existsSync(file)).toBe(false);
    for(const at of [port,worldPort])await expect(fetch(`http://127.0.0.1:${at}/game-api/health`,{signal:AbortSignal.timeout(500)})).rejects.toThrow();
  };
  try {
    launch();await waitFor(async()=>existsSync(file)&&(await fetch(`http://127.0.0.1:${port}/game-api/health`)).ok,()=>output);
    expect((await (await fetch(`http://127.0.0.1:${worldPort}/game-api/health`)).json()).root).toBe(root);
    await stop();
    const db=new DatabaseSync(dbFile);expect(db.prepare('PRAGMA integrity_check').get()).toMatchObject({integrity_check:'ok'});db.close();
    launch();await waitFor(async()=>existsSync(file)&&(await fetch(`http://127.0.0.1:${port}/game-api/health`)).ok,()=>output);
    await stop();
    launch();await waitFor(async()=>existsSync(file)&&(await fetch(`http://127.0.0.1:${port}/game-api/health`)).ok,()=>output);
    const crashed=once(child!,'exit');child!.kill();await crashed;
    await waitFor(async()=>{
      try { await fetch(`http://127.0.0.1:${worldPort}/game-api/health`,{signal:AbortSignal.timeout(300)});return false; }
      catch { return true; }
    },()=>output);
    launch();await waitFor(async()=>existsSync(file)&&(await fetch(`http://127.0.0.1:${port}/game-api/health`)).ok,()=>output);
    await stop();
  } finally {
    child?.kill();
    rmSync(dir,{recursive:true,force:true});
    if(existsSync(file))rmSync(file);
  }
},40000);

it('refuses an occupied world port instead of reusing or stopping another service',async()=>{
  const occupied=createServer();occupied.listen(0,'127.0.0.1');await once(occupied,'listening');
  const worldPort=(occupied.address() as {port:number}).port,port=await freePort();
  const child=fork(path.join(root,'scripts/local-game.ts'),['start',`--port=${port}`,`--world-port=${worldPort}`,`--session=conflict-${process.pid}`],{execArgv:['--import','tsx'],windowsHide:true,silent:true});
  let output='';child.stderr?.on('data',chunk=>{output+=String(chunk);});
  try {const [code]=await once(child,'exit');expect(code).toBe(1);expect(output).toContain(`Port ${worldPort} is occupied`);expect(occupied.listening).toBe(true);}
  finally {child.kill();await new Promise<void>(resolve=>occupied.close(()=>resolve()));}
},15000);
