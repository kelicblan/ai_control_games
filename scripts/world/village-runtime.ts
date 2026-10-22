import {TriggerDebugLog,actionName,safeDebugError,triggerEventName} from './trigger-debug';
import { DatabaseSync } from 'node:sqlite';
import {VillageAnimals} from './village-animals';
import {stageVillageReset} from './village-reset';
import {attachPixelLayout} from './pixel-layout';
import {pixelLayout,pixelTraverse} from '../../src/games/camp/world/pixel/navigation';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { digest, ensure,canonical } from '../../packages/action-runtime/src/json';
import { createHash,randomUUID } from 'node:crypto';
import {compactVillageSocialPrompt} from './village-social-prompt';
import type {VillageChannelLine} from './village-social-channel';
import {buildWorkDialogue,workDialogueSchema,validateWorkDialogue} from './village-work-dialogue';
import {observePersonalEvent} from '../../packages/social-core/src/knowledge';
import type { ActionCommand, CommandReceipt } from '../../packages/action-runtime/src/types';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState, restoreVillageState } from '../../src/games/camp/village/domain/state';
import type { VillageScenario, VillageState } from '../../src/games/camp/village/domain/types';
import { submitCommand, cancelExecution } from '../../src/games/camp/village/systems/commands';
import { recruit as acceptRecruit } from '../../src/games/camp/village/systems/recruitment';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { progressionView } from '../../src/games/camp/village/systems/progression';
import { initializeWorkshop, workshopView } from '../../src/games/camp/village/systems/workshop';
import { updateMilestones, journeyView } from '../../src/games/camp/village/systems/milestones';
import { projectDeliveries } from './village-playable-ui';
import { initializeEconomy, addResourceNode, importEcologyNodes } from '../../src/games/camp/village/systems/resources';
import { wildernessSites } from '../../src/games/camp/world/wildernessSites';
import { importForestResources } from '../../src/games/camp/world/forestExpansion';
import { refreshKnowledge } from '../../src/games/camp/village/systems/perception';
import { buildObservation, V4_SPEC } from '../../src/games/camp/village/ai/observation';
import { rankCandidates } from '../../packages/policy-runtime/src/candidate-mlp';
import { loadLifeAlpha } from '../mlp_v4/load';
import { appendEvent } from '../../packages/action-runtime/src/runtime';
import type { LoadedCandidateModel } from '../../packages/policy-runtime/src/types';
import { fileURLToPath } from 'node:url';
import { openVillageIssue, resolveVillageIssue, socialSemanticSignature } from './village-society';
import type { SocialGenerator } from '../../src/games/camp/village/social/context';
import { activateSocialPlan } from '../../src/games/camp/village/social/adapter';
import { recordConsent } from '../../packages/social-core/src/consent';
import { proposalTermsHash } from '../../packages/social-core/src/contracts';
import type { ConsentRecord } from '../../packages/social-core/src/types';
import { initializeCombat } from '../../src/games/camp/village/systems/combat';
import { chooseLifeTeacher } from '../../src/games/camp/village/ai/life-teacher';
import { chooseReleaseLifeTeacher } from '../../src/games/camp/village/ai/release-life-teacher';
import { chooseTacticalTeacher } from '../../src/games/camp/village/ai/tactical-teacher';
import { loadV4Bundle } from '../mlp_v4/load-bundle';
import { campaignScenario } from '../../src/games/camp/village/scenarios/campaign';
import { createActor } from '../../src/games/camp/village/domain/actors';
import { newWorld } from '../../src/games/camp/world/newWorldProfile';
import { repairWorldPosition } from '../../src/games/camp/world/navigation';
import { compactRuntimeHistory } from './village-history';
import { applyGoalRevision } from '../../src/games/camp/village/social/reflection';
import { previewMigration,migrateToNewWorld,type MigrationMappings } from '../../src/games/camp/village/domain/migration';
import { prepareSharedMapWaves } from './village-map';
import { villagePolicyPhase } from './village-scheduling';
import { villagePolicyFingerprint } from './village-policy-context';
import { maintainCombatSight } from './village-perception';
import { recipeCost, professionMultiplier } from '../../src/games/camp/village/systems/profession';
import {VillagePolicyFeedback} from './village-policy-feedback';
import { villageWeather, villageEnvironment,advanceVillageWeather,validateVillageWeather } from './village-weather';
import { setWeather, WEATHER_KINDS } from '../../src/games/camp/simulation/weather';
import type { Weather } from '../../src/games/camp/simulation/types';
export class VillageConflict extends Error {}
interface ValidatedCheckpoint{payload:string;checksum:string;revision:number;worldId:string;state:VillageState}
const checkpointDigest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export class VillageRuntime {
  private debugLog!:TriggerDebugLog;
  triggerRecords(owner:string,kind:string){const state=this.load(owner);if(!state)throw Error("正式世界尚未初始化");return this.debugLog.latest(owner,state.worldId,kind);}
  private feedback=new VillagePolicyFeedback();
  private pixelInputs=new Map<string,{x:number;y:number;at:number;worldId:string}>();
  private pixelInputStats=new Map<string,{received:number;nonzero:number;ticks:number;applied:number;expired:number;lastAge:number}>();
  pixelInputDiagnostics(owner:string){return {...this.pixelInputStats.get(owner)};}
  setPixelInput(owner:string,input:{x:number;y:number},worldId:string){
    ensure(pixelLayout&&[input.x,input.y].every(Number.isFinite)&&Math.abs(input.x)<=1&&Math.abs(input.y)<=1,'无效地图方向');
    // High-frequency input only needs the generation guard. Building the full public
    // snapshot twice per key heartbeat delays simulation and can expire held input.
    const row=this.db.prepare('SELECT world_id FROM village_worlds_v1 WHERE owner=?').get(owner);ensure(row&&row.world_id===worldId,'地图世界已变化');
    this.pixelInputs.set(owner,{...input,at:this.now(),worldId});
    const stats=this.pixelInputStats.get(owner)??{received:0,nonzero:0,ticks:0,applied:0,expired:0,lastAge:0};stats.received++;if(input.x||input.y)stats.nonzero++;this.pixelInputStats.set(owner,stats);
  }
  private db: DatabaseSync;
  private animals:VillageAnimals;
  private closed = false;
  private active = new Set<string>();
  private checkpoints=new Map<string,ValidatedCheckpoint>();
  private pendingCheckpoints=new Map<string,ValidatedCheckpoint>();
  private policies = new Map<string, LoadedCandidateModel>();
  readonly policyErrors = new Map<string, string>();
  private socialProvider?: (owner: string) => SocialGenerator;
  private socialBusy = new Set<string>();
  private socialLastWork = new Map<string,{worldId:string;at:number}>();
  private socialEpoch=new Map<string,number>();
  private socialAbort = new AbortController();
  readonly socialErrors = new Map<string, string>();
  setSocialProvider(provider: (owner: string) => SocialGenerator) { this.socialProvider = provider; }
  private async requestSocial(owner:string,worldId:string,id:string,prompt:string,schema:Parameters<SocialGenerator>[1],signal:AbortSignal){
      const call=randomUUID(),started=Date.now(),properties=schema.properties as Record<string,unknown>??{},stage=properties.speak?'utterance':properties.choice?'proposal':properties.response?'consent':'reflection';
      const state=this.load(owner),issue=state?.social.issues[id];
      const reason=String(issue?.basisRefs.map(ref=>state?.actors[issue.participants[0]]?.personal.knowledge.evidence[ref]?.facts.reason).find(Boolean)??'');const reasonText=reason.startsWith('rest:')?'精力不足，需要休息':reason.startsWith('equipment:')?'持有待分配装备':reason.startsWith('risk:')?'观测到敌人或受伤伙伴':reason;const names=issue?.participants.map(id=>state?.actors[id]?.name??id).join('、')??'工作交流';
      const context={callId:call,issueId:id,stage,participants:issue?.participants??[],issue:issue??null};
      this.debugLog.append(owner,worldId,'dialogue',state?.elapsed??0,`社会模型请求：${names}${reasonText?"（"+reasonText+"）":""} · ${stage==='utterance'?'工作交流':stage==='proposal'?'协作提议':stage==='consent'?'同意确认':'目标反思'} → 开始生成`,context);
      this.db.prepare('INSERT INTO village_social_calls_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(call,owner,worldId,id,stage,started,null,prompt.length,0,'running',null,null);
      try{const compact=compactVillageSocialPrompt(prompt);this.db.prepare('UPDATE village_social_calls_v1 SET sent_chars=? WHERE id=?').run(compact.length,call);const result=await this.socialProvider!(owner)(compact,schema,AbortSignal.any([signal,this.socialAbort.signal]));
        if(!this.closed){this.db.prepare('UPDATE village_social_calls_v1 SET ended_ms=?,status=?,result=? WHERE id=?').run(Date.now(),'completed',result,call);this.debugLog.append(owner,worldId,'dialogue',this.load(owner)?.elapsed??0,'模型返回 → 等待权威校验（尚未发布）',{callId:call,stage});}return result;
      }catch(error){if(!this.closed)this.debugLog.append(owner,worldId,'dialogue',this.load(owner)?.elapsed??0,'模型调用失败 → 未发布：'+safeDebugError(error),{callId:call,stage,error:safeDebugError(error)});if(!this.closed)this.db.prepare('UPDATE village_social_calls_v1 SET ended_ms=?,status=?,error=? WHERE id=?').run(Date.now(),'failed',(error instanceof Error?error.message:String(error)).slice(0,300),call);throw error;}
  }
  private scheduleWorkDialogue(owner:string){
    if(!this.socialProvider||this.socialBusy.has(owner)||this.closed)return;
    const state=this.load(owner);if(!state||state.paused||state.catchupTicks||state.tick%100>=this.speed(state))return;
    const last=this.socialLastWork.get(owner);if(last?.worldId===state.worldId&&state.elapsed-last.at<20)return;
    const lines=this.channelMessages(owner);
    const draft=buildWorkDialogue(state,key=>{const rows=this.db.prepare('SELECT status,count(*) AS n FROM village_social_calls_v1 WHERE world_id=? AND issue_id=? GROUP BY status').all(state.worldId,key);return rows.some(r=>r.status==='completed'||r.status==='failed'&&Number(r.n)>=3);},actor=>lines.some(l=>l.source==='village-model-speech'&&l.from===actor&&state.elapsed-l.at<30));
    if(!draft)return;
    const basis=state.actors[draft.actorId].personal.knowledge.evidence[draft.basisRef];
    this.debugLog.append(owner,state.worldId,'dialogue',state.elapsed,`${state.actors[draft.actorId].name}：${draft.replyTo?'实际听到伙伴发言':'本人经历工作事件'}（${triggerEventName(basis?.kind??draft.basisRef)}）→ 向${state.actors[draft.targetId].name}发起工作交流`,{actorId:draft.actorId,targetId:draft.targetId,basisRef:draft.basisRef,basis:basis??null,replyTo:draft.replyTo,distance:Math.hypot(state.actors[draft.actorId].position.x-state.actors[draft.targetId].position.x,state.actors[draft.actorId].position.y-state.actors[draft.targetId].position.y)});
    this.socialLastWork.set(owner,{worldId:state.worldId,at:state.elapsed});const epoch=this.socialEpoch.get(owner)??0;this.socialBusy.add(owner);
    void this.requestSocial(owner,draft.worldId,draft.key,draft.prompt,workDialogueSchema(draft),AbortSignal.timeout(60000)).then(raw=>{
      if(this.closed||(this.socialEpoch.get(owner)??0)!==epoch)return;
      this.transaction(()=>{const current=this.load(owner);if(!current||current.worldId!==draft.worldId){this.debugLog.append(owner,draft.worldId,'dialogue',state.elapsed,'所属世界已变化 → 丢弃旧工作对白',{basisRef:draft.basisRef});return;}const line=validateWorkDialogue(current,draft,raw);this.socialErrors.delete(owner);if(!line){let declined=false;try{declined=JSON.parse(raw)?.speak===false;}catch{}this.debugLog.append(owner,current.worldId,'dialogue',current.elapsed,`${current.actors[draft.actorId]?.name??draft.actorId}：${declined?'模型决定不讲话':'输出或现场条件未通过校验'} → 未发布`,{basisRef:draft.basisRef});return;}
        const inserted=this.db.prepare('INSERT OR IGNORE INTO village_social_publications_v1 VALUES(?,?,?,?)').run(line.id,owner,current.worldId,JSON.stringify(line));if(!inserted.changes)return;
        this.debugLog.append(owner,current.worldId,'dialogue',current.elapsed,`${current.actors[draft.actorId].name} → ${current.actors[draft.targetId].name}：已发布「${line.text}」`,{publicationId:line.id,basisRef:draft.basisRef});
        const revision=current.revision,event=appendEvent(current,'actor.said',[draft.actorId],{speakerId:draft.actorId,recipientId:draft.targetId,text:line.text,publicationId:line.id,source:line.source,replyDepth:draft.replyTo?1:0,replyTo:draft.replyTo,basisRef:draft.basisRef});
        event.visibleTo=[draft.actorId,draft.targetId];for(const actorId of event.visibleTo){const actor=current.actors[actorId];actor.personal.knowledge=observePersonalEvent(actorId,event,actor.personal.knowledge);}
        current.revision++;this.save(owner,current,revision);
      });
    }).catch(error=>{if(!this.closed&&(this.socialEpoch.get(owner)??0)===epoch)this.socialErrors.set(owner,error instanceof Error?error.message:String(error));}).finally(()=>{if((this.socialEpoch.get(owner)??0)===epoch)this.socialBusy.delete(owner);});
  }
  private scheduleSociety(owner: string) {
    if (!this.socialProvider || this.socialBusy.has(owner) || this.closed) return;
    let ticket: VillageState | undefined, issueId: string | undefined;
    this.transaction(() => {
      const state = this.load(owner); if (!state?.economy || state.paused || state.catchupTicks || state.tick % 100 >= this.speed(state)) return;
      // A persisted negotiation has no running request after its owning process exits.
      for(const issue of Object.values(state.social.issues))if(issue.status==='negotiating'){issue.status='waiting';issue.retryAfter=state.elapsed;issue.leaseUntil=state.elapsed;issue.attempts=Math.min(issue.attempts??1,2);issue.revision++;}
      for (const actor of Object.values(state.actors).filter(a => a.id !== state.playerId)) {
        const issue = openVillageIssue(state, actor.id); if (!issue) continue;
        const revision = state.revision; state.revision++; this.save(owner, state, revision); ticket = state; issueId = issue.id; break;
      }
    });
    if (!ticket || !issueId) return;
    const draft = ticket, id = issueId,epoch=this.socialEpoch.get(owner)??0;
    const signature = socialSemanticSignature(draft, id);
    this.socialBusy.add(owner);
    void resolveVillageIssue(draft, id, (prompt,schema,signal)=>this.requestSocial(owner,draft.worldId,id,prompt,schema,signal))
      .then(result => {
        if (this.closed) return;
        this.transaction(() => {
          const state = this.load(owner); if (!state || state.worldId !== draft.worldId || state.social.issues[id]?.status !== 'negotiating' || state.social.issues[id].revision !== draft.social.issues[id].revision) return;
          const revision = state.revision;
          const parties = draft.social.issues[id].participants;
          const proposal = result.proposal ? draft.social.proposals[result.proposal] : undefined;
          const relevantChanged = socialSemanticSignature(state, id) !== signature || Object.entries(proposal?.readSet ?? {}).some(([key, version]) => !parties.some(actor => key === `actor:${actor}`) && state.versions[key] !== version);
          state.social.issues[id].status = relevantChanged ? 'waiting' : draft.social.issues[id].status;
          state.social.issues[id].waitingForPlayer = !relevantChanged && draft.social.issues[id].waitingForPlayer === true;
          if (state.social.issues[id].status === 'waiting') state.social.issues[id].retryAfter = state.elapsed + 10 * 2 ** ((state.social.issues[id].attempts ?? 1) - 1);
          if (!relevantChanged && result.proposal) {
            state.social.proposals[result.proposal] = draft.social.proposals[result.proposal];
            state.social.proposals[result.proposal].readSet = Object.fromEntries(Object.entries(state.social.proposals[result.proposal].readSet).map(([key, version]) => [key, parties.some(actor => key === `actor:${actor}`) ? state.versions[key] : version]));
            state.social.consents.push(...draft.social.consents.filter(c => c.proposalId === result.proposal && !state.social.consents.some(old => old.operationId === c.operationId)));
            if (state.social.issues[id].status === 'agreed') activateSocialPlan(state, result.proposal);
            const spoken=state.social.proposals[result.proposal],line:VillageChannelLine={id:`${state.worldId}:proposal:${spoken.id}`,from:spoken.actorId,to:spoken.parties.filter(p=>p!==spoken.actorId),text:spoken.speech,at:state.elapsed,source:'village-model'};
            this.db.prepare('INSERT OR IGNORE INTO village_social_publications_v1 VALUES(?,?,?,?)').run(line.id,owner,state.worldId,JSON.stringify(line));
          }
          if(!relevantChanged&&result.goalRevision){applyGoalRevision(state,result.goalRevision.actorId,result.goalRevision);appendEvent(state,'goal.revised',[result.goalRevision.actorId],{goalId:result.goalRevision.id,kind:result.goalRevision.kind,revision:result.goalRevision.revision,basisRefs:result.goalRevision.basisRefs});}
          this.debugLog.append(owner,state.worldId,'dialogue',state.elapsed,`协作议题 ${id} → ${relevantChanged?'上下文变化，未采用':result.proposal?'提议已采用':'无可发布提议'}`,{issueId:id,proposalId:result.proposal??null,reason:result.reason??null,participants:parties});
          appendEvent(state, 'social.model_result', [draft.social.issues[id].participants[0]], { issueId: id, proposalId: relevantChanged ? null : result.proposal, reason: relevantChanged ? 'Relevant context changed' : result.reason ?? null });
          state.revision++; this.save(owner, state, revision);
          this.socialErrors.delete(owner);
        });
      }).catch(error => {
        if((this.socialEpoch.get(owner)??0)!==epoch)return;
        this.socialErrors.set(owner, error instanceof Error ? error.message : String(error));
        if (!this.closed) this.transaction(() => { const state = this.load(owner); if (!state?.social.issues[id]) return; const revision = state.revision; state.social.issues[id].status = 'waiting'; state.social.issues[id].retryAfter = state.elapsed + 10 * 2 ** ((state.social.issues[id].attempts ?? 1) - 1); state.revision++; this.save(owner, state, revision); });
      }).finally(() => {if((this.socialEpoch.get(owner)??0)===epoch)this.socialBusy.delete(owner);});
  }
  constructor(file: string,private readonly now=()=>Date.now(),private readonly offlineProgress=process.env.CAMP_VILLAGE_OFFLINE_PROGRESS!=='0') {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.animals=new VillageAnimals(this.db);
    this.debugLog=new TriggerDebugLog(this.db,file===':memory:'?file:path.resolve(file));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS village_worlds_v1(owner TEXT PRIMARY KEY, world_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, checksum TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS village_history_v1(owner TEXT NOT NULL,world_id TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT NOT NULL,checksum TEXT NOT NULL,PRIMARY KEY(owner,world_id,sequence));
      CREATE TABLE IF NOT EXISTS village_runtime_clock_v1(owner TEXT PRIMARY KEY,world_id TEXT NOT NULL,last_wall_ms INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS village_runtime_speed_v1(world_id TEXT PRIMARY KEY,speed INTEGER NOT NULL CHECK(speed IN (1,2,4)));
      CREATE TABLE IF NOT EXISTS village_migration_v1(owner TEXT NOT NULL,target_world_id TEXT NOT NULL,payload TEXT NOT NULL,checksum TEXT NOT NULL,PRIMARY KEY(owner,target_world_id));
      CREATE TABLE IF NOT EXISTS village_rule_clock_epochs_v1(owner TEXT NOT NULL,world_id TEXT NOT NULL,epoch TEXT NOT NULL,deferred_ticks INTEGER NOT NULL,source_revision INTEGER NOT NULL,source_wall_ms INTEGER NOT NULL,migrated_ms INTEGER NOT NULL,PRIMARY KEY(owner,world_id));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS village_social_calls_v1(id TEXT PRIMARY KEY,owner TEXT NOT NULL,world_id TEXT NOT NULL,issue_id TEXT NOT NULL,stage TEXT NOT NULL,started_ms INTEGER NOT NULL,ended_ms INTEGER,input_chars INTEGER NOT NULL,sent_chars INTEGER NOT NULL,status TEXT NOT NULL,error TEXT,result TEXT);
      CREATE INDEX IF NOT EXISTS village_social_calls_world_v1 ON village_social_calls_v1(world_id,started_ms);
      CREATE TABLE IF NOT EXISTS village_social_publications_v1(id TEXT PRIMARY KEY,owner TEXT NOT NULL,world_id TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS village_social_publications_world_v1 ON village_social_publications_v1(owner,world_id);`);
    this.db.prepare("UPDATE village_social_calls_v1 SET status='interrupted',ended_ms=?,error='Owning world host stopped before completion' WHERE status='running'").run(Date.now());
  }
  channelMessages(owner:string):VillageChannelLine[]{const row=this.db.prepare('SELECT world_id FROM village_worlds_v1 WHERE owner=?').get(owner);if(!row)return [];return this.db.prepare('SELECT payload FROM village_social_publications_v1 WHERE owner=? AND world_id=? ORDER BY rowid DESC LIMIT 100').all(owner,row.world_id).reverse().map(r=>JSON.parse(String(r.payload)) as VillageChannelLine).filter(m=>!m.to.includes('player'));}
  private socialDiagnostics(worldId:string){const row=this.db.prepare('SELECT owner FROM village_worlds_v1 WHERE world_id=?').get(worldId),owner=String(row?.owner??'');return {enabled:!!this.socialProvider,busy:this.socialBusy.has(owner),error:this.socialErrors.get(owner)??null,calls:this.db.prepare('SELECT stage,status,count(*) AS count FROM village_social_calls_v1 WHERE world_id=? GROUP BY stage,status').all(worldId),latest:this.db.prepare('SELECT stage,status,input_chars AS inputChars,sent_chars AS sentChars,started_ms AS startedMs,ended_ms AS endedMs,error FROM village_social_calls_v1 WHERE world_id=? ORDER BY started_ms DESC LIMIT 1').get(worldId)??null};}
  private load(owner: string): VillageState | null {
    ensure(typeof owner === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(owner), 'Invalid village owner');
    const row = this.db.prepare('SELECT payload,checksum,revision,world_id FROM village_worlds_v1 WHERE owner=?').get(owner);
    if (!row) return null;
    const cached=this.pendingCheckpoints.get(owner)??this.checkpoints.get(owner);
    if(cached&&cached.payload===row.payload&&cached.checksum===row.checksum&&cached.revision===row.revision&&cached.worldId===row.world_id)return structuredClone(cached.state);
    const input = JSON.parse(String(row.payload)); ensure(checkpointDigest(input) === row.checksum, 'Village save checksum mismatch');
    // Verify the original checksum first, then migrate geography before validating against the new map's site contract.
    // The formal launcher has already backed up the complete database under its single-writer lease.
    if(pixelLayout&&(!input.mapLayout||input.referenceLayoutVersion!==1||input.roadLayoutVersion!==1||input.waterLayoutVersion!==1)){const previous=input.revision;if(attachPixelLayout(input as VillageState)){this.save(owner,input as VillageState,previous);return structuredClone(input) as VillageState;}}
    const state = restoreVillageState(input, selectWorldRules('village-v1', input.ruleVersion));
    validateVillageWeather(state);
    if(!this.active.has(owner)&&state.history)for(const segment of state.history.segments){const archived=this.db.prepare('SELECT payload,checksum FROM village_history_v1 WHERE owner=? AND world_id=? AND sequence=?').get(owner,state.worldId,segment.sequence);ensure(archived&&archived.checksum===segment.hash&&digest(JSON.parse(String(archived.payload)))===segment.hash,'History archive checksum mismatch');}
    ensure(state.revision === row.revision && state.worldId === row.world_id, 'Village save identity mismatch');
    this.pendingCheckpoints.set(owner,{payload:String(row.payload),checksum:String(row.checksum),revision:state.revision,worldId:state.worldId,state:structuredClone(state)});
    return state;
  }
  private save(owner: string, state: VillageState, previous: number | null) {
    villageWeather(state);
    const validated=restoreVillageState(state, selectWorldRules('village-v1', state.ruleVersion));
    const payload = JSON.stringify(state); ensure(Buffer.byteLength(payload) <= 8_000_000, 'Village checkpoint budget exceeded');
    const checksum=checkpointDigest(state);
    if (previous === null) this.db.prepare('INSERT INTO village_worlds_v1 VALUES(?,?,?,?,?)').run(owner, state.worldId, state.revision, payload, checksum);
    else {
      const result = this.db.prepare('UPDATE village_worlds_v1 SET revision=?,payload=?,checksum=? WHERE owner=? AND revision=? AND world_id=?').run(state.revision, payload, checksum, owner, previous, state.worldId);
      if (result.changes !== 1) throw new VillageConflict('Village revision conflict');
    }
    this.db.prepare('INSERT INTO village_runtime_clock_v1 VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET world_id=excluded.world_id,last_wall_ms=excluded.last_wall_ms').run(owner,state.worldId,Math.floor(this.now()));
    if(previous===null&&state.ruleVersion==='p4-social-content-v1')this.db.prepare('INSERT OR IGNORE INTO village_rule_clock_epochs_v1 VALUES(?,?,?,?,?,?,?)').run(owner,state.worldId,'beast-tide-v2',0,state.revision,Math.floor(this.now()),Math.floor(this.now()));
    this.pendingCheckpoints.set(owner,{payload,checksum,revision:state.revision,worldId:state.worldId,state:validated});
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');this.pendingCheckpoints.clear(); try { const result = fn(); this.db.exec('COMMIT');for(const[owner,checkpoint]of this.pendingCheckpoints)this.checkpoints.set(owner,checkpoint);this.pendingCheckpoints.clear();return result; }
    catch (error) { this.db.exec('ROLLBACK');this.pendingCheckpoints.clear();throw error; }
  }
  private publicState(state: VillageState) {
    villageWeather(state);
    if(state.ruleVersion==='p4-social-content-v1'&&!this.policies.has(`${state.ruleHash}:life`)){
      try{
        const bundle=loadV4Bundle(process.env.CAMP_VILLAGE_MODEL_DIR??fileURLToPath(new URL('../../public/models/village-v4',import.meta.url)),state.ruleHash,V4_SPEC);
        for(const head of ['life','tactical']as const){const key=`${state.ruleHash}:${head}`;this.policies.set(key,bundle[head]);this.policyErrors.delete(key);}
      }catch(error){for(const head of ['life','tactical'])this.policyErrors.set(`${state.ruleHash}:${head}`,error instanceof Error?error.message:'Policy unavailable');}
    }
    const ecology=this.animals.publicState(state);
    const { wildlife:_wildlife, social: _social, operations: _operations, navigation: _navigation,policyMemo:_memo, ...world } = structuredClone(villageWeather(state));
    Object.assign(world,{ecology});
    // Read-only UI projection of the exact rules used by command validation.
    const uiRules = selectWorldRules('village-v1', state.ruleVersion), player = state.actors[state.playerId];
    const hasProfession=!!(uiRules.selection.choices.D11.effectiveValues as {professionEffects?:unknown})?.professionEffects;
    const uiCatalog = {
      weapons: uiRules.tables.weapons.map(recipe => ({ ...recipe, cost: hasProfession?recipeCost(uiRules, player, recipe):recipe.cost, duration: recipe.workSeconds / Math.max(.001, player.attributes.craft * (hasProfession?professionMultiplier(uiRules, player, 'craftMultiplier'):1)) })),
      fences: uiRules.tables.fences,
      craftEnabled: uiRules.capabilities.craft.configured,
      workshop: workshopView(state),
      journey: state.economy?.journey ? journeyView(state) : null,
      deliveries: projectDeliveries(state),
    };
    const actors = Object.fromEntries(Object.entries(world.actors).map(([id, actor]) => {
      const { personal: _personal, personality: _personality, ...visible } = actor;
      const task = Object.values(state.executions).find(e => e.command.actorId === id && ['accepted', 'running'].includes(e.status));
      const hunting=ecology?.hunt?.actorId===id?ecology.hunt:null;
      return [id, { ...visible, growth: progressionView(state, id), activity: task ? { action: task.command.action, remaining: task.remaining } : hunting?{action:hunting.phase==='attack'?'ATTACK':'REPOSITION',remaining:Math.max(0,hunting.until-state.elapsed)}:null }];
    }));
    return { ...world, ecology, presentation:villageEnvironment(state,this.speed(state)), uiCatalog, speed:this.speed(state), actors, models: Object.fromEntries([...this.policies.entries()].filter(([key]) => key.startsWith(state.ruleHash + ':')).map(([, model]) => [model.manifest.head, { modelId: model.manifest.modelId, modelHash: model.manifest.sha256 }])), policyErrors: Object.fromEntries([...this.policyErrors.entries()].filter(([key]) => key.startsWith(state.ruleHash + ':'))), social: {
      runtime:this.socialDiagnostics(state.worldId),
      issues: Object.fromEntries(Object.entries(state.social.issues).filter(([, i]) => i.participants.includes(state.playerId))),
      proposals: Object.fromEntries(Object.entries(state.social.proposals).filter(([, p]) => p.parties.includes(state.playerId)).map(([id, p]) => [id, { ...p, termsHash: proposalTermsHash(p), responded: state.social.consents.some(c => c.actorId === state.playerId && c.proposalId === p.id && c.proposalVersion === p.version) }])),
      agreements: Object.fromEntries(Object.entries(state.social.agreements).filter(([, a]) => a.parties.includes(state.playerId))),
    }, events: world.events.filter(e => e.visibleTo.includes(state.playerId) || e.participants.includes(state.playerId)).slice(-128),
      executions: Object.fromEntries(Object.entries(world.executions).filter(([, e]) => e.command.actorId === state.playerId)) };
  }
  resetPixelWorld(owner:string,revision:number,worldId:string,operationId:string){
    ensure(pixelLayout&&/^[a-zA-Z0-9-]{1,80}$/.test(operationId??''),'无效重置操作');
    this.db.exec('CREATE TABLE IF NOT EXISTS pixel_ui_resets(owner TEXT NOT NULL,operation TEXT NOT NULL,world_id TEXT NOT NULL,PRIMARY KEY(owner,operation))');
    this.transaction(()=>{
      if(this.db.prepare('SELECT 1 FROM pixel_ui_resets WHERE owner=? AND operation=?').get(owner,operationId))return;
      const state=this.load(owner);ensure(state&&state.worldId===worldId&&state.revision===revision,'Village revision conflict');
      stageVillageReset(this.db,owner);
      const next=this.db.prepare('SELECT world_id FROM village_reset_pending_v1 WHERE owner=?').get(owner)!;
      this.db.prepare('INSERT INTO pixel_ui_resets VALUES(?,?,?)').run(owner,operationId,next.world_id);
      if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='pixel_formal_exploration'").get())this.db.prepare('DELETE FROM pixel_formal_exploration WHERE owner=?').run(owner);
    });
    this.forgetResetWorld(owner);return this.read(owner);
  }
  forgetResetWorld(owner:string){this.active.delete(owner);this.checkpoints.delete(owner);this.pendingCheckpoints.delete(owner);this.socialBusy.delete(owner);this.socialErrors.delete(owner);this.socialEpoch.set(owner,(this.socialEpoch.get(owner)??0)+1);}
  private initialRoster(owner:string){
    if(!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshots'").get())return undefined;
    const row=this.db.prepare('SELECT payload FROM snapshots WHERE player=? AND quarantined=0 ORDER BY id DESC LIMIT 1').get(owner);
    return row?JSON.parse(String(row.payload)).state?.npcs as import('../../src/games/camp/simulation/types').GameState['npcs']|undefined:undefined;
  }
  /** Explicit repair for the shipped two-companion reset template; never resurrects a normal campaign. */
  repairInitialRoster(owner:string,expectedWorldId:string){return this.transaction(()=>{
    const state=this.load(owner);ensure(state&&state.worldId===expectedWorldId,'Repair world changed');
    const roster=this.initialRoster(owner);ensure(roster?.length===9,'Original nine-person roster required');
    const center=state.economy!.storePosition,rules=selectWorldRules('village-v1',state.ruleVersion);
    const specs=campaignScenario(state.worldId,state.seed,center,p=>repairWorldPosition(p,state.seed),roster).actors;
    ensure(state.actors['recruit-1']&&state.actors['recruit-2'],'Not the affected two-companion template');
    if(specs.slice(2).every(s=>state.actors[s.instanceId]))return this.publicState(state);
    ensure(Object.keys(state.actors).length===3,'Unexpected roster; repair requires review');
    const previous=state.revision;
    specs.forEach((spec,i)=>{
      // Retain the first two runtime identities, jobs, gear, relationships and body progress.
      if(i<2){const actor=state.actors[`recruit-${i+1}`];actor.name=spec.initial!.name!;Object.assign(actor.personality,spec.initial!.personality);state.versions[`actor:${actor.id}`]++;}
      else{state.actors[spec.instanceId]=createActor(spec.archetypeId,spec.instanceId,spec.initial!,rules.tables.actors);state.versions[`actor:${spec.instanceId}`]=0;state.economy!.experience[spec.instanceId]=0;}
    });
    refreshKnowledge(state);state.revision++;this.save(owner,state,previous);return this.publicState(state);
  });}
  observePixelWildlife(owner:string,center:{x:number;y:number},span:number){const s=this.load(owner);return s?this.animals.observe(s,center,span):[];}
  read(owner: string) {
    const pendingTable=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='village_reset_pending_v1'").get();
    const reset=pendingTable?this.db.prepare('SELECT world_id,seed FROM village_reset_pending_v1 WHERE owner=?').get(owner):undefined;
    if(reset){const existing=this.db.prepare('SELECT world_id FROM village_worlds_v1 WHERE owner=?').get(owner);ensure(!existing||existing.world_id===reset.world_id,'Reset generation conflict');if(!existing){const seed=Number(reset.seed),center=newWorld?.spawn??{x:50,y:55};this.create(owner,{...campaignScenario(String(reset.world_id),seed,center,p=>repairWorldPosition(p,seed),this.initialRoster(owner)),navigationMode:'shared-world'},true);}this.db.prepare('DELETE FROM village_reset_pending_v1 WHERE owner=? AND world_id=?').run(owner,reset.world_id);}
    return this.transaction(()=>{const state = this.load(owner);
    if(state){const previous=state.revision;if(attachPixelLayout(state))this.save(owner,state,previous);}
    if(state?.navigation && state.economy && !state.economy.workshop && state.ruleVersion === 'p4-social-content-v1') { const previous = state.revision; initializeWorkshop(state, true); updateMilestones(state); state.revision++; this.save(owner, state, previous); }
    // Never apply new survival/raid rules retroactively to a legacy rules backlog.
    // Preserve that unapplied time in an audit ledger, retaining bodies and inventory.
    if(state&&state.ruleVersion==='p4-social-content-v1'&&!this.db.prepare('SELECT 1 FROM village_rule_clock_epochs_v1 WHERE owner=? AND world_id=?').get(owner,state.worldId)){
      const clock=this.db.prepare('SELECT world_id,last_wall_ms FROM village_runtime_clock_v1 WHERE owner=?').get(owner),wall=clock?.world_id===state.worldId?Number(clock.last_wall_ms):Math.floor(this.now()),gap=this.offlineProgress&&!state.paused?Math.max(0,Math.floor((this.now()-wall)/100)):0,previous=state.revision;
      this.db.prepare('INSERT INTO village_rule_clock_epochs_v1 VALUES(?,?,?,?,?,?,?)').run(owner,state.worldId,'beast-tide-v2',(state.catchupTicks??0)+gap,previous,wall,Math.floor(this.now()));state.catchupTicks=0;state.revision++;this.save(owner,state,previous);
    }
    if(state&&!this.active.has(owner)&&!state.paused&&this.offlineProgress){const clock=this.db.prepare('SELECT world_id,last_wall_ms FROM village_runtime_clock_v1 WHERE owner=?').get(owner);if(clock?.world_id===state.worldId){const backlog=Math.max(0,Math.floor((this.now()-Number(clock.last_wall_ms))/100));if(backlog){const revision=state.revision;state.catchupTicks=(state.catchupTicks??0)+backlog;state.revision++;this.save(owner,state,revision);}}}
    if(state)this.active.add(owner);return state?this.publicState(state):null;}); }
  create(owner: string, scenario: VillageScenario, startPlaying = false) {
    return this.transaction(() => { ensure(!this.load(owner), 'Village already exists'); ensure(scenario.classification === 'experiment', 'Service requires experiment scenario');
      const rules = selectWorldRules('village-v1', scenario.ruleVersion ?? 'draft-table-v1');
      const state = createVillageState(rules, scenario);
      state.paused = !startPlaying;
      if (rules.capabilities.gather.configured) {
        initializeEconomy(state, rules);
        if (scenario.storePosition) state.economy!.storePosition = { ...scenario.storePosition };
        if (scenario.storePosition) state.actors.player.position = { ...scenario.storePosition };
        if (state.economy!.foodSources && scenario.storePosition) for (const site of Object.values(state.economy!.foodSources)) site.position = repairWorldPosition({ x: site.position.x + scenario.storePosition.x, y: site.position.y + scenario.storePosition.y }, state.seed);
        if (scenario.navigationMode === 'shared-world') state.navigation = { mode: 'shared-world', routes: {} };
        if (state.navigation && state.ruleVersion === 'p4-social-content-v1') { initializeWorkshop(state); updateMilestones(state); }
        if (rules.capabilities.combat.configured) initializeCombat(state, { center: { ...state.economy!.storePosition }, radius: 10, ...(state.navigation ? { kind: 'shared-world' as const, gatePosition: newWorld?.gate ?? { x: 50, y: 12 } } : {}) });
        if (state.navigation && state.combat) state.combat.gateOpen = true;
        ensure((scenario.resourceNodes?.length ?? 0) <= 128, 'Scenario node budget exceeded');
        for (const node of scenario.resourceNodes ?? []) addResourceNode(state, rules, node);
        if (scenario.useEcologyNodes === true) importEcologyNodes(state, rules, wildernessSites(state.seed).filter(site => site.kind === 'wood').slice(0, Math.max(0, 128 - Object.keys(state.economy!.nodes).length)));
        refreshKnowledge(state);
      }
      attachPixelLayout(state);this.save(owner, state, null); this.active.add(owner); return this.publicState(state); });
  }
  createCampaign(owner: string, seed: number) {
    ensure(Number.isSafeInteger(seed), 'Invalid campaign seed');
    const center = newWorld?.spawn ?? { x: 50, y: 55 };
    return this.create(owner, { ...campaignScenario(`campaign-${digest({ owner, seed }).slice(0, 24)}`, seed, center, p => repairWorldPosition(p, seed),this.initialRoster(owner)), navigationMode: 'shared-world' });
  }
  hasWorld(owner:string){return Boolean(this.db.prepare('SELECT 1 FROM village_worlds_v1 WHERE owner=?').get(owner));}
  ensureUpgraded(owner:string,source:unknown|null,sourceWorldId:string){
    const current=this.read(owner);if(current)return current;
    if(source===null){const created=this.createCampaign(owner,64138);return this.setPaused(owner,created.revision,false,created.worldId);}
    const old=source as import('../../src/games/camp/simulation/types').GameState;
    const actors=Object.fromEntries(old.npcs.map(n=>[n.id,/观察|探索|机灵/.test(n.role)?'W003':n.personality.bravery>=.7&&n.personality.diligence>=.7?'W002':'W001']));
    return this.migrateLegacy(owner,source,{sourceWorldId,actors,acknowledgeArchive:true},digest(source),true);
  }
  previewLegacy(source:unknown,mappings:MigrationMappings){return{migrationPreview:previewMigration(source,mappings),archetypes:selectWorldRules('village-v1','p4-social-content-v1').tables.actors.filter(a=>a.kind!=='player').map(a=>({id:a.id,name:a.name}))};}
  migrateLegacy(owner:string,source:unknown,mappings:MigrationMappings,expectedSourceHash:string,startPlaying=false){return this.transaction(()=>{
    ensure(!this.load(owner),'A new-mode save already exists; migration cannot overwrite it');
    const result=migrateToNewWorld(source,mappings,`migrated-${digest({owner,expectedSourceHash}).slice(0,24)}`,expectedSourceHash);
    const state=result.world,rules=selectWorldRules('village-v1',state.ruleVersion),center=state.economy!.storePosition;
    state.navigation={mode:'shared-world',routes:{}};
    initializeWorkshop(state, true); updateMilestones(state);
    initializeCombat(state,{center:{...center},radius:10,kind:'shared-world',gatePosition:newWorld?.gate??{x:50,y:12}});
    state.combat!.gateOpen=true;state.combat!.waveEpoch=state.elapsed;
    for(const node of campaignScenario('upgrade-resources',state.seed,center,p=>repairWorldPosition(p,state.seed)).resourceNodes??[])addResourceNode(state,rules,node);
    for(const site of Object.values(state.economy!.foodSources??{}))site.position=repairWorldPosition(site.position,state.seed);
    refreshKnowledge(state);state.paused=!startPlaying;
    this.save(owner,result.world,null);const payload=JSON.stringify(result.audit);this.db.prepare('INSERT INTO village_migration_v1 VALUES(?,?,?,?)').run(owner,result.world.worldId,payload,digest(result.audit));this.active.add(owner);return this.publicState(result.world);
  });}
  private guardMutation(state:VillageState,revision:number,worldId?:string,readSet?:Record<string,number>){
    if(worldId!==undefined&&worldId!==state.worldId)throw new VillageConflict('Village world changed');
    if(state.revision===revision)return;
    if(state.ruleVersion!=='p4-social-content-v1'||worldId!==state.worldId)throw new VillageConflict('Village revision conflict');
    if(readSet&&(!Object.hasOwn(readSet,`actor:${state.playerId}`)||Object.entries(readSet).some(([key,value])=>state.versions[key]!==value)))throw new VillageConflict('Village entities changed');
  }
  command(owner: string, revision: number, command: ActionCommand,worldId?:string): CommandReceipt {
    return this.transaction(() => {
      const state = this.load(owner); ensure(state, 'Village does not exist');
      this.guardMutation(state,state.revision,worldId);
      ensure(command.actorId === state.playerId && command.source === 'player_input' && !command.planId, 'HTTP command requires player authority');
      ensure(!state.catchupTicks,'Village is catching up; wait before issuing actions');
      if(state.ruleVersion==='p4-social-content-v1')ensure(Number.isSafeInteger(command.issuedAtTick)&&command.issuedAtTick!<=state.tick,'New-mode commands require simulation issue tick');
      if (state.operations[command.operationId]) return submitCommand(state, command);
      this.guardMutation(state,revision,worldId,command.readSet);
      ensure(!this.animals.busy(state),'Hunter is busy; cancel hunting before another action');
      const previous=state.revision,receipt = submitCommand(state, command); state.revision++; this.save(owner, state, previous); return receipt;
    });
  }
  huntAnimal(owner:string,revision:number,targetId:string,operationId:string,worldId?:string){return this.transaction(()=>{const state=this.load(owner);ensure(state,'Village does not exist');this.guardMutation(state,revision,worldId);ensure(!state.paused&&!state.catchupTicks,'Unpause before hunting');const previous=state.revision;this.animals.hunt(state,targetId,operationId);state.revision++;this.save(owner,state,previous);return this.publicState(state);});}
  cancelHunt(owner:string,revision:number,worldId?:string){return this.transaction(()=>{const state=this.load(owner);ensure(state,'Village does not exist');this.guardMutation(state,revision,worldId);const previous=state.revision;this.animals.cancel(state);state.revision++;this.save(owner,state,previous);return this.publicState(state);});}
  setPaused(owner: string, revision: number, paused: boolean,worldId?:string) {
    return this.transaction(() => { const state = this.load(owner); ensure(state && typeof paused === 'boolean', 'Invalid village pause');
      this.guardMutation(state,revision,worldId);
      const previous=state.revision;state.paused = paused; state.revision++; this.save(owner, state, previous); this.active.add(owner); return this.publicState(state); });
  }
  setSpeed(owner:string,revision:number,speed:number,worldId?:string){return this.transaction(()=>{
    const state=this.load(owner);ensure(state&&[1,2,4].includes(speed),'Invalid village speed');this.guardMutation(state,revision,worldId);
    this.db.prepare('INSERT INTO village_runtime_speed_v1 VALUES(?,?) ON CONFLICT(world_id) DO UPDATE SET speed=excluded.speed').run(state.worldId,speed);
    const previous=state.revision;state.revision++;this.save(owner,state,previous);return this.publicState(state);
  });}
  private speed(state:VillageState){return Number(this.db.prepare('SELECT speed FROM village_runtime_speed_v1 WHERE world_id=?').get(state.worldId)?.speed??1);}
  setWeather(owner:string,revision:number,kind:Weather,worldId?:string){return this.transaction(()=>{
    const state=this.load(owner);ensure(state&&WEATHER_KINDS.includes(kind),'Invalid village weather');this.guardMutation(state,revision,worldId);
    const previous=state.revision;setWeather(villageWeather(state),kind);state.revision++;this.save(owner,state,previous);return this.publicState(state);
  });}
  recruit(owner: string, revision: number, offerId: string,worldId?:string) {
    return this.transaction(() => { const state = this.load(owner); ensure(state?.economy, 'Village economy unavailable');
      this.guardMutation(state,state.revision,worldId);
      ensure(!state.catchupTicks,'Village is catching up');
      if (!state.economy.offers[offerId]?.acceptedBy)this.guardMutation(state,revision,worldId);
      const previous = state.revision, receipt = acceptRecruit(state, offerId); state.revision++; this.save(owner, state, previous); return receipt;
    });
  }
  consent(owner: string, revision: number, input: Omit<ConsentRecord, 'actorId'>,worldId?:string) {
    return this.transaction(() => {
      const state = this.load(owner); ensure(state, 'Village unavailable'); const proposal = state.social.proposals[input.proposalId];
      this.guardMutation(state,state.revision,worldId);
      ensure(!state.catchupTicks,'Village is catching up');
      ensure(proposal && proposal.parties.includes(state.playerId), 'Player is not a proposal party');
      const consent: ConsentRecord = { ...input, actorId: state.playerId };
      const old = state.social.consents.some(c => c.operationId === input.operationId);
      if (!old)this.guardMutation(state,revision,worldId);
      const receipt = recordConsent(consent, proposal, state.social.consents); ensure(receipt.accepted, receipt.reason ?? 'Invalid player consent');
      if (old) return { accepted: true };
      state.social.consents = receipt.records; const issue = state.social.issues[proposal.issueId]; issue.waitingForPlayer = false;
      if (consent.response === 'decline') issue.status = 'rejected';
      else if (proposal.parties.every(actor => state.social.consents.filter(c => c.actorId === actor && c.proposalId === proposal.id && c.proposalVersion === proposal.version && c.termsHash === proposalTermsHash(proposal)).at(-1)?.response === 'accept')) {
        issue.status = 'agreed'; activateSocialPlan(state, proposal.id);
      }
      const previous = state.revision; state.revision++; this.save(owner, state, previous); return { accepted: true };
    });
  }
  cancel(owner: string, revision: number, operationId: string, executionId: string,worldId?:string) {
    return this.transaction(() => { const state = this.load(owner); ensure(state, 'Village unavailable');
      this.guardMutation(state,state.revision,worldId);
      ensure(!state.catchupTicks,'Village is catching up');
      if (!state.operations[operationId])this.guardMutation(state,revision,worldId);
      const previous = state.revision, receipt = cancelExecution(state, executionId, state.playerId, operationId); state.revision++; this.save(owner, state, previous); return receipt;
    });
  }
  tick() {
    for (const owner of this.active) {this.scheduleWorkDialogue(owner);this.scheduleSociety(owner);}
    for (const owner of this.active) this.transaction(() => { const state = this.load(owner); if (!state || state.paused) return;
      const revision = state.revision;
      importForestResources(state,selectWorldRules('village-v1',state.ruleVersion),newWorld?.forestExpansion);
      const catchup=Math.min(128,state.catchupTicks??0);
      const steps=catchup>0?catchup+1:this.speed(state);
      for(let catchupIndex=0;catchupIndex<steps;catchupIndex++){
      const motion=this.pixelInputs.get(owner),player=state.actors[state.playerId];
      const motionStats=this.pixelInputStats.get(owner);if(motionStats){motionStats.ticks++;motionStats.lastAge=motion?this.now()-motion.at:0;if(motion&&(motion.x||motion.y)&&motionStats.lastAge>1000)motionStats.expired++;}
      if(pixelLayout&&motion&&motion.worldId===state.worldId&&this.now()-motion.at<=1000&&!state.catchupTicks&&player.body.hp>0&&!player.body.downed&&!player.body.incapacitated&&(motion.x||motion.y)){
       this.animals.cancel(state);
       for(const task of Object.values(state.executions))if(task.command.actorId===state.playerId&&['accepted','running'].includes(task.status))cancelExecution(state,task.id,state.playerId,`pixel-walk:${task.id}`);
       const length=Math.max(1,Math.hypot(motion.x,motion.y)),step=.45;
       for(const p of [{x:player.position.x+motion.x/length*step,y:player.position.y+motion.y/length*step},{x:player.position.x+motion.x/length*step,y:player.position.y},{x:player.position.x,y:player.position.y+motion.y/length*step}])if(pixelTraverse(player.position,p,state.combat?.gateOpen!==false||(state.economy?.fence.hp??0)<=0)){if(motionStats&&Math.hypot(player.position.x-p.x,player.position.y-p.y)>0)motionStats.applied++;player.position=p;state.versions[`actor:${state.playerId}`]++;break;}
      }
      this.animals.ensure(state);
      if (state.economy) {
        if(state.tick%5===0){refreshKnowledge(state);maintainCombatSight(state);}
        for (const actor of Object.values(state.actors).filter(a => a.id !== state.playerId)) {
          const phase=state.ruleVersion==='p4-social-content-v1'?villagePolicyPhase(actor.id):0;if(state.tick%5!==phase)continue;
          const knownThreat=Object.values(actor.personal.knowledge.entities).some(e=>e.kind==='enemy'&&Number(e.values.hp)>0&&state.elapsed-e.at<=5);
          if(knownThreat){const task=Object.values(state.executions).find(e=>e.command.actorId===actor.id&&['accepted','running'].includes(e.status)&&!['ATTACK','REPOSITION','RETREAT','RESCUE','HEAL','SEEK_SHELTER'].includes(e.command.action));if(task)cancelExecution(state,task.id,actor.id,`threat-cancel:${state.tick}:${actor.id}`);}
          const head = state.combat && Object.values(actor.personal.knowledge.entities).some(e => e.kind === 'enemy' && Number(e.values.hp) > 0 && state.elapsed - e.at <= 5) ? 'tactical' : 'life';
          if(head === 'life' && state.tick % 20 !== phase) continue;
          const fingerprint=villagePolicyFingerprint(state,actor.id);
          const memo=state.policyMemo?.[actor.id];if(head==='life'&&memo?.fingerprint===fingerprint&&memo.nextAt>state.elapsed)continue;
          const observation = this.feedback.mask(state,buildObservation(state, actor.id, this.feedback.observedKnowledge(state,actor.id), head));
          let selected: string | null, source: 'mlp' | 'fallback' = 'mlp', modelId: string | null = null, modelHash: string | null = null, rawScores: Record<string, number> = {};
          const key = `${state.ruleHash}:${head}`;
          try {
            let policy = this.policies.get(key);
            if (!policy) {
              if(state.ruleVersion==='p2-life-alpha-v1'){policy=loadLifeAlpha(fileURLToPath(new URL('../../public/models/village-life-alpha-v1', import.meta.url)),state.ruleHash,V4_SPEC);this.policies.set(key,policy);}
              else{const bundle=loadV4Bundle(process.env.CAMP_VILLAGE_MODEL_DIR??fileURLToPath(new URL('../../public/models/village-v4',import.meta.url)),state.ruleHash,V4_SPEC);this.policies.set(`${state.ruleHash}:life`,bundle.life);this.policies.set(`${state.ruleHash}:tactical`,bundle.tactical);policy=bundle[head];}
            }
            const decision = rankCandidates(policy, observation); selected = decision.selectedCandidateId; modelId = decision.modelId; modelHash = decision.modelHash; rawScores = decision.rawScores;
            this.policyErrors.delete(key);
          } catch (error) { source = 'fallback'; selected = head === 'tactical' ? chooseTacticalTeacher(observation) : state.ruleVersion==='p4-social-content-v1'?chooseReleaseLifeTeacher(observation):chooseLifeTeacher(observation); this.policyErrors.set(key, error instanceof Error ? error.message : 'Policy unavailable'); }
          const candidate = observation.candidates.find(c => c.id === selected);
          if (!candidate){this.debugLog.append(owner,state.worldId,'mlp',state.elapsed,`${actor.name}：${head==='tactical'?'战术':'日常'}决策；生命 ${actor.body.hp.toFixed(0)} / 精力 ${actor.body.energy.toFixed(0)} / 饥饿 ${actor.body.hunger.toFixed(0)}${actor.body.downed?' / 已倒地':''}${actor.body.incapacitated?' / 失去行动能力':''} → 无可执行候选（候选 ${observation.candidates.length}，已知可行 ${observation.knownLegalMask.filter(Boolean).length}）`,{actorId:actor.id,head,source,modelId,observation,rawScores,selected});continue;}
          const receipt = submitCommand(state, { operationId: `mlp:${digest({ tick: state.tick, actorId: actor.id }).slice(0, 32)}`, actorId: actor.id, issuedAtTick:state.tick, action: candidate.action, parameters: candidate.parameters, readSet: candidate.readSet, source, ...(candidate.targetId ? { targetId: candidate.targetId } : {}) });
          if(!receipt.accepted)this.feedback.remember(state,candidate,receipt.reason??'');
          (state.policyMemo??={})[actor.id]={fingerprint,nextAt:state.elapsed+(receipt.accepted?120:2)};
          this.debugLog.append(owner,state.worldId,'mlp',state.elapsed,`${actor.name}：${knownThreat?'观测到威胁':'日常决策到期或观测变化'}；饥饿 ${actor.body.hunger.toFixed(0)} / 精力 ${actor.body.energy.toFixed(0)} / 生命 ${actor.body.hp.toFixed(0)} → ${actionName(candidate.action)}${candidate.targetId?'（目标 '+candidate.targetId+'）':''} → ${receipt.accepted?'已接受执行':'执行拒绝：'+receipt.reason} · ${source==='mlp'?'MLP':'规则兜底'}`,{actorId:actor.id,head,source,modelId,modelHash,observation,selectedCandidate:candidate,rawScores,receipt,body:{hunger:actor.body.hunger,energy:actor.body.energy,hp:actor.body.hp},fallbackError:source==='fallback'?safeDebugError(this.policyErrors.get(key)):null});
          appendEvent(state, 'policy.decision', [actor.id], { source, head, modelId, modelHash, selectedCandidateId: selected, rawScores, executionId: receipt.executionId ?? null, accepted: receipt.accepted, ...(receipt.accepted?{}:{reason:receipt.reason??'Rejected'}) });
        }
      }
      this.animals.prepareHumanExecutions(state);prepareSharedMapWaves(state);advanceVillage(state);advanceVillageWeather(state,.1);this.animals.step(state);
      if(catchupIndex<catchup)state.catchupTicks!--;
      if(state.ruleVersion==='p4-social-content-v1'&&state.tick%10===0)compactRuntimeHistory(state,batch=>this.db.prepare('INSERT INTO village_history_v1 VALUES(?,?,?,?,?)').run(owner,state.worldId,batch.sequence,JSON.stringify(batch),checkpointDigest(batch)),256);
      }
      this.save(owner, state, revision); });
  }
  close() { if (!this.closed) { this.closed = true; this.socialAbort.abort(); this.db.close(); } }
}
