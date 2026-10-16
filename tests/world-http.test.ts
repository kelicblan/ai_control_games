import { afterAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {createGame} from '../src/games/camp/simulation/engine';
import { WorldRuntime } from '../scripts/world/runtime';
import { baselinePolicy } from '../src/games/camp/ai/policy';

const dir = mkdtempSync(path.join(tmpdir(), 'camp-http-'));
let file = path.join(dir, 'world.sqlite');
let child: ChildProcess | undefined;
async function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/world/server.ts'], {
    cwd: process.cwd(), windowsHide: true, env: { ...process.env, CAMP_WORLD_DB: file, CAMP_WORLD_PORT: '0',CAMP_SOCIAL_OFFLINE:'1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr!.on('data', data => { errors += String(data); });
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`World startup timeout: ${errors}`)), 10000);
    child!.once('exit', code => { clearTimeout(timeout); reject(new Error(`World exited ${code}: ${errors}`)); });
    child!.stdout!.on('data', data => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
  });
}
async function stop() { if (child && child.exitCode === null) { const closed = once(child, 'exit'); child.kill('SIGKILL'); await closed; } child = undefined; }
afterAll(async () => { await stop(); rmSync(dir, { recursive: true, force: true }); });
describe('real independent service and SQLite', () => {
  it('shows normal system text immediately and masks only the configured terms while models are offline',async()=>{
    await stop();file=path.join(dir,'word-list.sqlite');
    const player='22222222-2222-4222-8222-222222222222',runtime=new WorldRuntime(file,baselinePolicy);
    const initial=runtime.mutate(player,0,'seed',{type:'start',options:{mode:'rules'}},'tab');
    runtime.socialCommit(player,initial.dialogueScope!,s=>{s.status='paused';s.events.push({id:s.nextEventId++,time:s.elapsed,kind:'info',text:'营地正常运转。共产党和党员，其他文字保留。'});});
    runtime.close();
    try{
      const url=await start(),headers={Cookie:`campmind-player=${player}`,'X-Camp-Tab':'word-list-test'};
      const response=await fetch(`${url}/game-api/world`,{headers}),snapshot=await response.json();
      expect(response.ok).toBe(true);
      expect(snapshot.state.events.at(-1).text).toBe('营地正常运转。**和**，其他文字保留。');
      expect(JSON.stringify(snapshot)).not.toContain('内容审核中');
      expect(JSON.stringify(snapshot)).not.toContain('内容暂不可显示');
    }finally{await stop();file=path.join(dir,'world.sqlite');}
  },20000);
  it('rejects arbitrary client-authored NPC dialogue even during offline replay and after restart', async () => {
    await stop(); file = path.join(dir, 'dialogue-catchup.sqlite');
    const player = '11111111-1111-4111-8111-111111111111';
    const runtime = new WorldRuntime(file, baselinePolicy, () => Date.now() - 600000);
    const initial = runtime.mutate(player, 0, 'seed', { type: 'start', options: { mode: 'rules' } }, 'tab');
    runtime.close();
    let url = await start();
    const headers = { Cookie: `campmind-player=${player}`, 'X-Camp-Tab': 'catchup-test', 'Content-Type': 'application/json' };
    const result = { id: 'ambient:catchup-http', npcId: initial.state!.npcs[0].id, at: 0,
      text: '咱们先把事情说清楚吧。', source: 'minimind3', latencyMs: 12000 };
    const body = JSON.stringify({ revision: initial.revision, operation: 'reply', action: { type: 'dialogue-result', scope: initial.dialogueScope, result } });
    const response = await fetch(`${url}/game-api/world`, { method: 'POST', headers, body });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('世界服务生成');
    await stop(); url = await start();
    const duplicate = await fetch(`${url}/game-api/world`, { method: 'POST', headers, body });
    expect(duplicate.status).toBe(503);expect((await duplicate.json()).error).toContain('世界服务生成');
    await stop(); file = path.join(dir, 'world.sqlite');
  }, 20000);
  it('persists remote credentials for the cookie owner across a hard restart without returning keys', async () => {
    await stop(); file = path.join(dir, 'remote.sqlite'); let url = await start();
    const session = await fetch(`${url}/game-api/session`, { headers: { 'X-Camp-Tab': 'remote-test' } });
    expect(session.status).toBe(200);
    const cookie = session.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'X-Camp-Tab': 'remote-test', 'Content-Type': 'application/json' };
    const config = { id: 'remote-saved', name: '数据库模型', model: 'small', baseUrl: 'https://provider.example/v1' };
    const save = await fetch(`${url}/game-api/remote-models`, { method: 'POST', headers, body: JSON.stringify({ action: 'save', config, apiKey: 'fake-db-secret' }) });
    expect(save.status).toBe(200); const saved = await save.json();
    expect(saved.models[0]).toMatchObject({ hasKey: true, requiresKey: true }); expect(JSON.stringify(saved)).not.toContain('fake-db-secret');
    const stranger = await fetch(`${url}/game-api/remote-models`, { headers: { 'X-Camp-Tab': 'stranger' } });
    expect(await stranger.json()).toEqual({ models: [] });
    await stop(); url = await start();
    const restored = await fetch(`${url}/game-api/remote-models`, { headers }); expect(await restored.json()).toEqual(saved);
    // Avoid calling a provider: inspect the durable encrypted row and exercise authenticated decryption separately in the store test.
    const db = new DatabaseSync(file);
    try { expect(Buffer.from(db.prepare('SELECT api_key FROM remote_models').get()!.api_key as Uint8Array).toString()).not.toContain('fake-db-secret'); }
    finally { db.close(); }
    const denied = await fetch(`${url}/game-api/remote-models`, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example' }, body: JSON.stringify({ action: 'delete', id: config.id }) });
    expect(denied.status).toBe(403);
    await stop(); file = path.join(dir, 'world.sqlite');
  }, 20000);
  it('advances without any clients, survives a hard process kill, and rejects stale writes', async () => {
    let url = await start();
    const initial = await fetch(`${url}/game-api/world`, { headers: { 'X-Camp-Tab': 'http-test' } });
    const cookie = initial.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'X-Camp-Tab': 'http-test', 'Content-Type': 'application/json' };
    const post = (revision: number, operation: string, action: unknown) => fetch(`${url}/game-api/world`, { method: 'POST', headers, body: JSON.stringify({ revision, operation, action }) });
    const started = await (await post(0, 'start', { type: 'start', options: { mode: 'model', seed: 17 } })).json();
    expect(started.revision).toBe(1);
    // No GET or browser heartbeat during this interval: the independent service ticks.
    const db = new DatabaseSync(file);
    let persisted;
    try {
      // Observe SQLite only: do not let client requests drive the simulation.
      const deadline=Date.now()+10000;
      while(Date.now()<deadline){
        const latest=db.prepare('SELECT payload FROM snapshots ORDER BY id DESC LIMIT 1').get();
        if(latest&&JSON.parse(String(latest.payload)).state.elapsed>=1)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      const rows = db.prepare('SELECT payload FROM snapshots ORDER BY id DESC').all();
      expect(rows.length).toBeGreaterThan(1);
      persisted = JSON.parse(String(rows[0].payload)); expect(persisted.state.elapsed).toBeGreaterThanOrEqual(1);
      expect(persisted.state.stats.modelDecisions).toBeGreaterThan(0);
    } finally { db.close(); }
    await stop(); await new Promise(resolve => setTimeout(resolve, 700)); url = await start();
    const restored = await (await fetch(`${url}/game-api/world`, { headers })).json();
    expect(restored.state.elapsed).toBeGreaterThan(persisted.state.elapsed + .5);
    const duplicate = await (await post(0, 'start', { type: 'start', options: { mode: 'rules' } })).json();
    expect(duplicate.state.mode).toBe('model'); expect(duplicate.state.elapsed).toBeGreaterThan(1);
    expect((await post(0, 'stale', { type: 'speed', speed: 4 })).status).toBe(409);
    const foreign = await fetch(`${url}/game-api/world`, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example' }, body: '{}' });
    expect(foreign.status).toBe(403);
  }, 30000);
  it('persists an authoritative closed gate across service restart',async()=>{
    await stop();file=path.join(dir,'gate.sqlite');let url=await start();
    const initial=await fetch(`${url}/game-api/world`,{headers:{'X-Camp-Tab':'gate-test'}});
    const cookie=initial.headers.get('set-cookie')!.split(';')[0];
    const headers={Cookie:cookie,'X-Camp-Tab':'gate-test','Content-Type':'application/json'};
    let snapshot=await initial.json();
    const post=async(operation:string,action:unknown)=>{
      const response=await fetch(`${url}/game-api/world`,{method:'POST',headers,body:JSON.stringify({revision:snapshot.revision,operation,action})});
      expect(response.status).toBe(200);snapshot=await response.json();
    };
    const paused=createGame({mode:'rules',seed:17});paused.status='paused';
    await post('import-gate-world',{type:'import',state:paused});
    await post('close-gate',{type:'command',command:{type:'gate-toggle'}});
    expect(snapshot.state.world.gateOpen).toBe(false);
    await stop();url=await start();
    snapshot=await(await fetch(`${url}/game-api/world`,{headers})).json();
    expect(snapshot.state.world.gateOpen).toBe(false);
    await post('reopen-gate',{type:'command',command:{type:'gate-toggle'}});
    expect(snapshot.state.world.gateOpen).toBe(true);
  },20000);
});
