import test from 'node:test';
import assert from 'node:assert/strict';
import {startMapServer} from '../../scripts/pixel-world/server.mjs';

test('真实回环HTTP：鉴权、跨站拒绝、世界协议与输入',async()=>{
  const host=await startMapServer({database:':memory:',port:0});
  const req=(route,init={})=>fetch(host.connection.endpoint+route,{...init,headers:{'x-pixel-token':host.connection.token,...init.headers}});
  try{
    assert.equal((await fetch(host.connection.endpoint+'/health')).status,200);
    assert.equal((await fetch(host.connection.endpoint+'/manifest')).status,403);
    assert.equal((await req('/manifest',{headers:{origin:'https://evil.invalid'}})).status,403);
    const manifest=await (await req('/manifest')).json();assert.equal(manifest.region.width,32000);assert.equal(manifest.scope,'map-preview');
    const chunk=await (await req('/chunk?x=108&y=136')).json();assert.equal(chunk.tiles.length,4096);
    assert.equal((await req('/chunk?x=9999&y=0')).status,400);
    assert.equal((await req('/chunk?x=0.5&y=0')).status,400);
    assert.equal((await req('/chunk?x=&y=0')).status,400);
    assert.equal((await req('/atlas?size=8192')).status,400);
    assert.equal((await req('/input',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:0,y:1})})).status,200);
    assert.equal((await req('/input',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:9,y:1})})).status,400);
    assert.equal((await req('/input',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status,400);
    assert.equal((await req('/input',{method:'POST',headers:{'content-type':'application/json'},body:' '.repeat(5000)})).status,413);
    assert.equal((await req('/teleport',{method:'POST'})).status,404);
  }finally{await host.close();}
});
test('正式世界没有被提供给预览API，停止输入后位置保持不变',async()=>{
  const host=await startMapServer({database:':memory:',port:0});
  try{
    const result=await fetch(host.connection.endpoint+'/snapshot',{headers:{'x-pixel-token':host.connection.token}});
    const s=await result.json();assert.equal(s.scope,'map-preview');assert.equal(s.npcs,undefined);assert.equal(s.models,undefined);
    assert.equal((await fetch(host.connection.endpoint+'/game-api/world',{headers:{'x-pixel-token':host.connection.token}})).status,404);
  }finally{await host.close();}
});

test('同一验收存档互斥启动，正常退出清理自己的连接文件与锁',async()=>{
  const {mkdtempSync,existsSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const path=await import('node:path');
  const dir=mkdtempSync(path.join(tmpdir(),'pixel-http-')),file=path.join(dir,'map.sqlite'),connectionFile=path.join(dir,'connection.json');let host;
  try{
    host=await startMapServer({database:file,connectionFile});assert.equal(existsSync(connectionFile),true);
    await assert.rejects(()=>startMapServer({database:file}),/已有宿主/);assert.equal(existsSync(file+'.pixel-lock'),true);
    await host.close();assert.equal(existsSync(connectionFile),false);assert.equal(existsSync(file+'.pixel-lock'),false);
    host=await startMapServer({database:file,connectionFile});assert.equal(existsSync(connectionFile),true);
  }finally{if(host)await host.close();rmSync(dir,{recursive:true,force:true});}
});
