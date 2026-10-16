import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {launchEditorWorld} from '../scripts/unity/editor-world-host.mjs';
test('Editor Play owns an isolated real world, preserves it across stops and releases its server',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'camp-editor-world-'));let host;
  try{
    const options={root:path.resolve('.'),dataDirectory:path.join(temp,'data'),runDirectory:path.join(temp,'first'),offline:true};
    host=await launchEditorWorld(options);
    const headers={'Content-Type':'application/json','X-Camp-Tab':'editor-host-test','X-Camp-Native-Protocol':'1',Cookie:`campmind-player=${host.player}`};
    const call=async(action)=>{const current=await(await fetch(host.endpoint+'/game-api/world',{headers})).json();if(!action)return current;const response=await fetch(host.endpoint+'/game-api/world',{method:'POST',headers,body:JSON.stringify({revision:current.revision,operation:crypto.randomUUID(),action})});assert.equal(response.status,200);return response.json();};
    assert.equal((await call()).state,null);
    await call({type:'start',options:{seed:17,mode:'rules'}});
    const paused=await call({type:'pause',paused:true});const player=host.player,endpoint=host.endpoint;
    assert.equal(paused.state.npcs.length,9);assert.equal(paused.state.status,'paused');
    const catalogResponse=await fetch(host.endpoint+'/game-api/native-models',{headers});assert.equal(catalogResponse.status,200);
    const catalog=await catalogResponse.json();assert.ok(Array.isArray(catalog.models));assert.ok(catalog.models.every(model=>!('path'in model)&&!('key'in model)));
    const mapResponse=await fetch(host.endpoint+'/game-api/native-map?x=50&y=55&span=800',{headers});assert.equal(mapResponse.status,200);
    const raster=await mapResponse.json();assert.equal(Buffer.from(raster.rgba,'base64').length,130*130*4);
    assert.deepEqual((await call()).state.world.exploration,paused.state.world.exploration);
    await host.stop();host=null;
    await assert.rejects(fetch(endpoint+'/game-api/health',{signal:AbortSignal.timeout(1000)}));
    host=await launchEditorWorld({...options,runDirectory:path.join(temp,'second')});
    assert.equal(host.player,player);const restored=await call();
    assert.equal(restored.dialogueScope,paused.dialogueScope);assert.equal(restored.state.status,'paused');assert.equal(restored.state.food,paused.state.food);
  }finally{if(host)await host.stop();const resolved=path.resolve(temp);assert.equal(path.dirname(resolved).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(resolved).startsWith('camp-editor-world-'));rmSync(resolved,{recursive:true,force:true});}
});
test('the same Editor save cannot acquire two authoritative writers',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'camp-editor-world-'));let first,second;
  try{
    const options={root:path.resolve('.'),dataDirectory:path.join(temp,'data'),runDirectory:path.join(temp,'first'),offline:true,leaseWaitMs:150};
    first=await launchEditorWorld(options);
    await assert.rejects(launchEditorWorld({...options,runDirectory:path.join(temp,'second')}).then(host=>{second=host;return host;}),/already running/);
  }finally{if(second)await second.stop();if(first)await first.stop();const resolved=path.resolve(temp);assert.equal(path.dirname(resolved).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(resolved).startsWith('camp-editor-world-'));rmSync(resolved,{recursive:true,force:true});}
});
