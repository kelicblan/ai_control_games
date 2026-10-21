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
import { nativeProtocol, nativeSnapshot, nativeAudioContext, NativeProtocolError } from './native-protocol';
import {projectVillageChannel} from './village-social-channel';
import {NativeMapProjection} from './native-map';
import { StartupModels } from './startup-models';
import { remoteCompletion } from '../native-models/remote';
import { VillageConflict } from './village-runtime';
import { CognitionSettingsStore } from './cognition-settings';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'public/models/manifest.json'), 'utf8'));
const bytes = readFileSync(path.join(root, 'public/models', manifest.weightsFile));
if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('策略模型校验失败');
const model = decodePolicy(manifest, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
const database = path.resolve(process.env.CAMP_WORLD_DB ?? path.join(root, 'data/world.sqlite'));
const runtime = new WorldRuntime(database, observation => inferPolicy(model, observation),Date.now,50,process.env.CAMP_WORLD_OFFLINE_PROGRESS!=='0');
const cognitionSettings=new CognitionSettingsStore(database);
const playerCognition=(player:string)=>cognitionSettings.read(player,runtime.read(player).state?.agency);
const nativeMap=new NativeMapProjection();
const port = Number(process.env.CAMP_WORLD_PORT ?? 18081);
const cookieName = 'campmind-player';
let remoteStore: RemoteCredentialStore | undefined;
const localAppraisal=new MiniMindAppraisal(root);
const nativeAppraisal=new NativeAppraisal(root);
const startupModels=new StartupModels(localAppraisal,(player,id)=>id.startsWith('native:')
  ? {prepare:()=>nativeAppraisal.prepare(id.slice(7)),status:()=>nativeAppraisal.status()}
  : {prepare:async()=>{await remoteCompletion({...(remoteStore??=new RemoteCredentialStore(database)).credentials(player,id),prompt:'请只回复：准备好了。',test:true},AbortSignal.timeout(25000));},status:()=>({stage:'connecting',progress:null})});
const appraisalProvider=createAppraisalProvider(()=>remoteStore??=new RemoteCredentialStore(database),localAppraisal,nativeAppraisal);
const lexicon=new Lexicon(path.resolve(process.env.CAMP_BLOCKED_WORDS??path.join(root,'config/moderation/blocked-words.txt'))).watch();
const moderation=new Moderation(lexicon);
const socialModel=createSocialModel(()=>remoteStore??=new RemoteCredentialStore(database),localAppraisal,nativeAppraisal);
if (process.env.CAMP_SOCIAL_OFFLINE !== '1') runtime.village?.setSocialProvider(player => async (prompt, schema, signal) => {
  const settings=playerCognition(player);
  if(!settings.cognition)throw new Error('大模型认知已关闭');
  const selected = settings.modelId;
  try { return await socialModel(player, selected)(prompt, schema, signal); }
  catch (error) { if (selected === 'minimind3' || signal.aborted) throw error; return localAppraisal.generateJSON(prompt, schema, signal); }
});
const reviewedAppraisals=new ReviewedAppraisals(moderation);
runtime.setAppraisalPublicationGate(raw=>reviewedAppraisals.accepts(raw));
runtime.setAppraisalProvider(async(player,modelId,prompt,signal)=>reviewedAppraisals.review(await appraisalProvider(player,modelId,prompt,signal),socialModel(player,modelId),signal));
// Explicit offline mode makes dialogue generation unavailable; lexical masking remains active.
const society=new SocietyService(runtime,moderation,process.env.CAMP_SOCIAL_OFFLINE==='1'?()=>async()=>{throw new Error('社会模型离线');}:socialModel);
const server = createServer((req, res) => {
  if(process.env.CAMP_WORLD_TRACE_REQUESTS==='1'){const started=performance.now();res.once('finish',()=>console.log(JSON.stringify({kind:'request-timing',method:req.method,route:(req.url??'').split('?')[0],status:res.statusCode,ms:performance.now()-started})));}
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  void (async () => {
    const route = (req.url ?? '').split('?')[0];
    const native=route==='/game-api/world'&&nativeProtocol(req.headers['x-camp-native-protocol']);
    const audioContext=native?nativeAudioContext(req.headers['x-camp-audio-context']):undefined;
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
    if(route==='/game-api/cognition-settings'){
      if(req.method==='GET'){reply(200,playerCognition(player));return;}
      if(req.method!=='POST'||req.headers['content-type']!=='application/json'){reply(415,{error:'需要 JSON POST'});return;}
      let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>2048){reply(413,{error:'请求过大'});return;}}
      reply(200,cognitionSettings.save(player,JSON.parse(text)));return;
    }
    if (route === '/game-api/session' && req.method === 'GET') {
      res.setHeader('Set-Cookie', `${cookieName}=${player}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
      reply(200, { ok: true }); return;
    }
    if (route === '/game-api/village') {
      const village = runtime.village;
      if (!village) { reply(404, { error: '新玩法实验模式未启用' }); return; }
      if (req.headers['x-camp-village-protocol'] !== '1') { reply(426, { error: '需要 village 协议 1' }); return; }
      if (req.method === 'GET') { reply(200, village.read(player)); return; }
      if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') { reply(415, { error: '需要 JSON POST' }); return; }
      let text = '';
      for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 100_000) { reply(413, { error: '请求过大' }); return; } }
      const input = JSON.parse(text);
      if(input.type==='ensure-upgraded'){
        const current=village.read(player);if(current){reply(200,current);return;}
        const legacy=runtime.read(player);
        reply(200,village.ensureUpgraded(player,legacy.state,legacy.dialogueScope??`legacy-${player}`));return;
      }
      if(input.type==='migration-preview'||input.type==='migration-apply'){
        const legacy=runtime.read(player);if(!legacy.state)throw new Error('没有可转换的旧世界');
        const mappings={...input.mappings,sourceWorldId:legacy.dialogueScope??`legacy-${player}`};
        if(input.type==='migration-preview'){reply(200,village.previewLegacy(legacy.state,mappings));return;}
        if(legacy.state.status==='playing')throw new Error('请先暂停旧世界，再核对转换预览');
        reply(200,village.migrateLegacy(player,legacy.state,mappings,input.sourceHash));return;
      }
      if (input.type === 'campaign') { reply(200, village.createCampaign(player, input.seed)); return; }
      if (input.type === 'create') { reply(200, village.create(player, input.scenario)); return; }
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error('无效世界修订');
      if (input.type === 'command') { reply(200, village.command(player, input.revision, input.command,input.worldId)); return; }
      if(input.type==='animal-hunt'){reply(200,village.huntAnimal(player,input.revision,input.targetId,input.operationId,input.worldId));return;}
      if(input.type==='animal-hunt-cancel'){reply(200,village.cancelHunt(player,input.revision,input.worldId));return;}
      if (input.type === 'recruit') { reply(200, village.recruit(player, input.revision, input.offerId,input.worldId)); return; }
      if (input.type === 'consent') { reply(200, village.consent(player, input.revision, input.consent,input.worldId)); return; }
      if (input.type === 'cancel') { reply(200, village.cancel(player, input.revision, input.operationId, input.executionId,input.worldId)); return; }
      if (input.type === 'pause') { reply(200, village.setPaused(player, input.revision, input.paused,input.worldId)); return; }
      if(input.type==='speed'){reply(200,village.setSpeed(player,input.revision,input.speed,input.worldId));return;}
      if(input.type==='weather'){reply(200,village.setWeather(player,input.revision,input.weather,input.worldId));return;}
      throw new Error('不支持的新玩法操作');
    }
    if(route==='/game-api/native-models'&&req.method==='GET'){
      const metadata=await nativeAppraisal.metadata();
      reply(200,{...metadata,status:playerCognition(player).modelId==='minimind3'?localAppraisal.status():metadata.status});return;
    }
    if(route==='/game-api/startup-models'&&(req.method==='GET'||req.method==='POST')){
      const modelId=playerCognition(player).modelId;
      if(req.method==='POST')startupModels.begin(player,modelId);
      reply(200,startupModels.snapshot(player,modelId));return;
    }
    if(route==='/game-api/native-map'&&req.method==='GET'){
      if(!nativeProtocol(req.headers['x-camp-native-protocol']))throw new Error('地图需要原生协议');
      const query=new URL(req.url!,'http://localhost').searchParams,state=runtime.read(player).state;
      if(!state)throw new Error('世界尚未开始');
      reply(200,nativeMap.project(state,{center:{x:Number(query.get('x')),y:Number(query.get('y'))},span:Number(query.get('span'))}));return;
    }
    if (route.startsWith('/game-api/remote-models')) {
      const controller = new AbortController(); res.once('close', () => { if (!res.writableEnded) controller.abort(); });
      reply(200, await remoteSettingsRoute(req, route, player, remoteStore ??= new RemoteCredentialStore(database), controller.signal,id=>runtime.invalidateAppraisalModel(player,id))); return;
    }
    if (req.method === 'GET' && route === '/game-api/world') { reply(200, nativeSnapshot(projectVillageChannel(society.snapshot(player, owner),runtime.village?.channelMessages(player)??[]),native,audioContext)); return; }
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
      reply(200, nativeSnapshot(projectVillageChannel(society.snapshot(player,owner),runtime.village?.channelMessages(player)??[]),native,audioContext)); return;
    }
    reply(404, { error: '接口不存在' });
  })().catch(error => reply(error instanceof NativeProtocolError?426:error instanceof WorldConflict || error instanceof VillageConflict ? 409 : 503, { code:error instanceof NativeProtocolError?'UNSUPPORTED_NATIVE_PROTOCOL':error instanceof WorldConflict || error instanceof VillageConflict?'REVISION_CONFLICT':'REQUEST_OR_STORAGE_FAILED',error: error instanceof Error ? error.message : '存档服务异常' }));
});
server.requestTimeout = 10000;
// Let the launcher confirm readiness before historical-world catch-up can occupy
// the event loop. Reads still advance the requested world during this short grace.
const startedAt=Date.now();
const timer = setInterval(() => {if(Date.now()-startedAt>=2000){runtime.tick();society.tick();}}, 100);
server.listen(port, '127.0.0.1', () => console.log(`CampMind world: http://127.0.0.1:${(server.address() as { port: number }).port}; SQLite: ${database}`));
server.on('error', error => { clearInterval(timer); localAppraisal.dispose(); nativeAppraisal.dispose(); cognitionSettings.close();runtime.close(); console.error(error); process.exit(1); });
let stopping = false;
const shutdown = () => { if (stopping) return; stopping = true; clearInterval(timer); society.close();lexicon.close();runtime.tick(); localAppraisal.dispose(); nativeAppraisal.dispose(); server.close(() => { remoteStore?.close(); cognitionSettings.close();runtime.close(); process.exit(0); }); };
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, shutdown);
process.on('message', message => { if (message && typeof message === 'object' && 'type' in message && message.type === 'campmind-stop') shutdown(); });
process.once('disconnect', shutdown);
// A fork can lose IPC while imports are still executing, before the listener exists.
if(typeof process.send==='function'&&!process.connected)shutdown();
