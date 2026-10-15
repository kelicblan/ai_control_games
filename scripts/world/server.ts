import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePolicy, inferPolicy } from '../../src/games/camp/ai/policy';
import { WorldConflict, WorldRuntime } from './runtime';
import type { WorldAction } from '../../src/integrations/world/types';
import { RemoteCredentialStore, remoteSettingsRoute } from './remote-models';
import { createAppraisalProvider,createSocialModel } from './appraisal-provider';
import { Lexicon } from './moderation/lexicon';
import { Moderation } from './moderation/service';
import { ReviewedAppraisals } from './moderation/appraisals';
import { SocietyService } from './society-service';
import { MiniMindAppraisal } from './minimind-appraisal';
import { NativeAppraisal } from './native-appraisal';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/models/manifest.json'), 'utf8'));
const bytes = readFileSync(path.join(root, 'public/models', manifest.weightsFile));
if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('策略模型校验失败');
const model = decodePolicy(manifest, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
const database = path.resolve(process.env.CAMP_WORLD_DB ?? path.join(root, 'data/world.sqlite'));
const runtime = new WorldRuntime(database, observation => inferPolicy(model, observation));
const port = Number(process.env.CAMP_WORLD_PORT ?? 18081);
const cookieName = 'campmind-player';
let remoteStore: RemoteCredentialStore | undefined;
const localAppraisal=new MiniMindAppraisal(root);
const nativeAppraisal=new NativeAppraisal(root);
const appraisalProvider=createAppraisalProvider(()=>remoteStore??=new RemoteCredentialStore(database),localAppraisal,nativeAppraisal);
const lexicon=new Lexicon(path.resolve(process.env.CAMP_BLOCKED_WORDS??path.join(root,'config/moderation/blocked-words.txt'))).watch();
const moderation=new Moderation(lexicon);
const socialModel=createSocialModel(()=>remoteStore??=new RemoteCredentialStore(database),localAppraisal,nativeAppraisal);
const reviewedAppraisals=new ReviewedAppraisals(moderation);
runtime.setAppraisalPublicationGate(raw=>reviewedAppraisals.accepts(raw));
runtime.setAppraisalProvider(async(player,modelId,prompt,signal)=>reviewedAppraisals.review(await appraisalProvider(player,modelId,prompt,signal),socialModel(player,modelId),signal));
// Explicit offline mode makes dialogue generation unavailable; lexical masking remains active.
const society=new SocietyService(runtime,moderation,process.env.CAMP_SOCIAL_OFFLINE==='1'?()=>async()=>{throw new Error('社会模型离线');}:socialModel);
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  void (async () => {
    const route = (req.url ?? '').split('?')[0];
    if (route === '/game-api/health' && req.method === 'GET') { reply(200, { service: 'campmind-world-v1', root, dialogueProtocol:'records-v1', socialProtocol:'society-v1',moderation:{ready:lexicon.ready,version:lexicon.version,error:lexicon.error,...moderation.stats},npcAgencyVersion:1, memorySchemaVersion:2, cognitionBinding:'dialogue', cognitionBackends:['minimind3','native','remote-test'], errors: runtime.errors.size }); return; }
    const origin = req.headers.origin;
    if (origin) {
      let valid = false;
      try { valid = new URL(origin).host === (req.headers['x-forwarded-host'] ?? req.headers.host); } catch { /* invalid origin */ }
      if (!valid) { reply(403, { error: '只允许游戏同源请求' }); return; }
    }
    const owner = req.headers['x-camp-tab'];
    if (typeof owner !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(owner)) { reply(400, { error: '缺少页面标识' }); return; }
    const match = (req.headers.cookie ?? '').match(/(?:^|;\s*)campmind-player=([a-f0-9-]{36})(?:;|$)/);
    const player = match?.[1] ?? randomUUID();
    if (!match) res.setHeader('Set-Cookie', `${cookieName}=${player}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
    if (route === '/game-api/session' && req.method === 'GET') {
      res.setHeader('Set-Cookie', `${cookieName}=${player}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
      reply(200, { ok: true }); return;
    }
    if (route.startsWith('/game-api/remote-models')) {
      const controller = new AbortController(); res.once('close', () => { if (!res.writableEnded) controller.abort(); });
      reply(200, await remoteSettingsRoute(req, route, player, remoteStore ??= new RemoteCredentialStore(database), controller.signal,id=>runtime.invalidateAppraisalModel(player,id))); return;
    }
    if (req.method === 'GET' && route === '/game-api/world') { reply(200, society.snapshot(player, owner)); return; }
    if(req.method==='GET'&&route==='/game-api/conversations'){
      const url=new URL(req.url!,'http://localhost'),page=Number(url.searchParams.get('page')??1),raw=url.searchParams.get('through'),through=raw===null?undefined:Number(raw);
      if(!Number.isSafeInteger(page)||page<1||(through!==undefined&&(!Number.isSafeInteger(through)||through<0)))throw new Error('对话分页无效');
      const result=runtime.conversations(player,page,through,url.searchParams.get('scope')??undefined),state=runtime.read(player).state;
      reply(200,state?society.project(player,state,result):result);return;
    }
    if (req.method === 'GET' && route === '/game-api/memories') {
      const url=new URL(req.url!,'http://localhost'),before=url.searchParams.get('before');
      if(before!==null&&(!Number.isSafeInteger(Number(before))||Number(before)<1))throw new Error('记忆分页无效');
      const generation=url.searchParams.get('generation'),branch=url.searchParams.get('branch');
      const memories=runtime.memories(player,url.searchParams.get('npc')??'',before===null?undefined:Number(before),generation&&branch?{generation,branch}:undefined);
      const state=runtime.read(player).state;reply(200,state?society.project(player,state,memories):memories);return;
    }
    if (req.method === 'POST' && route === '/game-api/world') {
      if (req.headers['content-type'] !== 'application/json') { reply(415, { error: '需要 JSON 请求' }); return; }
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 1_100_000) { reply(413, { error: '请求过大' }); return; } }
      const input = JSON.parse(text);
      if (!Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.operation !== 'string'
        || !/^[a-zA-Z0-9-]{1,64}$/.test(input.operation) || !input.action || typeof input.action.type !== 'string') throw new Error('世界操作格式无效');
      await society.mutate(player, input.revision, input.operation, input.action as WorldAction, owner);
      reply(200, society.snapshot(player,owner)); return;
    }
    reply(404, { error: '接口不存在' });
  })().catch(error => reply(error instanceof WorldConflict ? 409 : 503, { error: error instanceof Error ? error.message : '存档服务异常' }));
});
server.requestTimeout = 10000;
// Let the launcher confirm readiness before historical-world catch-up can occupy
// the event loop. Reads still advance the requested world during this short grace.
const startedAt=Date.now();
const timer = setInterval(() => {if(Date.now()-startedAt>=2000){runtime.tick();society.tick();}}, 100);
server.listen(port, '127.0.0.1', () => console.log(`CampMind world: http://127.0.0.1:${(server.address() as { port: number }).port}; SQLite: ${database}`));
server.on('error', error => { clearInterval(timer); localAppraisal.dispose(); nativeAppraisal.dispose(); runtime.close(); console.error(error); process.exit(1); });
let stopping = false;
const shutdown = () => { if (stopping) return; stopping = true; clearInterval(timer); society.close();lexicon.close();runtime.tick(); localAppraisal.dispose(); nativeAppraisal.dispose(); server.close(() => { remoteStore?.close(); runtime.close(); process.exit(0); }); };
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, shutdown);
process.on('message', message => { if (message && typeof message === 'object' && 'type' in message && message.type === 'campmind-stop') shutdown(); });
process.once('disconnect', shutdown);
