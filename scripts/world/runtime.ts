import { createGame, advanceGameSteps, issueCommand } from '../../src/games/camp/simulation/engine';
import { restoreGameState } from '../../src/games/camp/simulation/persistence';
import { validDialogueLine } from '../../src/games/camp/dialogue/commit';
import { fingerprint, captionWithinWindow } from '../../src/games/camp/dialogue/context';
import { ACTIONS, NPC_IDS, type PolicyFunction } from '../../src/games/camp/simulation/types';
import type { WorldAction, WorldSnapshot } from '../../src/integrations/world/types';
import { SnapshotStore, type Checkpoint } from './store';
import { baselinePolicy } from '../../src/games/camp/ai/policy';
import { LOCAL_PLAYER_ID, stopLord } from '../../src/games/camp/simulation/lord';
import { agencyPerson, ensureAgency, remember, reviseSpeechMemory } from '../../src/games/camp/npc/experience';
import { AppraisalScheduler } from './appraisal-scheduler';
import { acceptAppraisal, appraisalSignature, buildAppraisalContext, type AppraisalTicket } from '../../src/games/camp/npc/appraisal';
import { randomUUID } from 'node:crypto';
import { validDialogueRecord, retainDialogueRecords } from '../../src/games/camp/dialogue/records';
import { openPlayerConversation,respond } from '../../src/games/camp/social/state';

const LORD_INPUT_LEASE_MS = 350;
type World = { checkpoint: Checkpoint; savedAt: number; savedStatus: Checkpoint['state']['status']; recovered: boolean; lordInputUntil?: number; catchingUp?: boolean };
export class WorldConflict extends Error { constructor() { super('世界修订已变化，请查看最新进度后重试操作'); } }
export class WorldRuntime {
  private store: SnapshotStore;
  private worlds = new Map<string, World>();
  private closed = false;
  private socialBusy=new Set<string>();
  setSocialBusy(player:string,busy:boolean){if(busy){this.socialBusy.add(player);this.scheduler.cancelPrefix(`${player}:`);}else this.socialBusy.delete(player);}
  private scheduler = new AppraisalScheduler<AppraisalTicket>();
  private provider?: (player:string,modelId:string,prompt:string,signal:AbortSignal)=>Promise<string>;
    private nativeAppraisalBusy=false;
    private nativePlayerCursor?:string;
  setAppraisalProvider(provider:NonNullable<WorldRuntime['provider']>){this.provider=provider;}
  private appraisalGate?:(raw:string|null)=>boolean;
  setAppraisalPublicationGate(gate:(raw:string|null)=>boolean){this.appraisalGate=gate;}
  invalidateAppraisalModel(player:string,modelId:string){
    const world=this.get(player),a=world?.checkpoint.state.agency;if(!world||!a||a.modelId!==modelId)return;
    this.scheduler.cancelPrefix(`${player}:`);a.settingsRevision++;
    for(const p of Object.values(a.people))p.appraisalStatus='fallback';
    this.persist(player,world);
  }
  readonly errors = new Map<string, string>();
  players(){return this.store.players();}
  hasOperation(player:string,operation:string){return this.store.seen(player,operation);}
  /** Clone + SQLite transaction: no partially applied social effects survive a failed save. */
  socialCommit(player:string,scope:string,apply:(state:Checkpoint['state'])=>void):boolean {
    const world=this.get(player);if(!world||this.errors.has(player)||scope!==`${world.checkpoint.journal?.generation}:${world.checkpoint.journal?.branch}`)return false;
    const state=structuredClone(world.checkpoint.state);apply(state);
    const candidate={...world,checkpoint:{...world.checkpoint,state,revision:world.checkpoint.revision+1}};
    this.persist(player,candidate);this.worlds.set(player,candidate);return true;
  }
  constructor(file: string, private policy: PolicyFunction, private now = Date.now, private maxSteps = 50, private offlineProgress = true) { this.store = new SnapshotStore(file); }
  private get(player: string): World | null {
    const existing = this.worlds.get(player); if (existing) return existing;
    const loaded = this.store.load(player); if (!loaded.checkpoint) return null;
    // The Editor owns a world only during Play. Preserve the save, but do not
    // present time spent editing/compiling as a rapidly replayed live world.
    if (!this.offlineProgress) loaded.checkpoint.at = this.now();
    const world = { checkpoint: loaded.checkpoint, savedAt: loaded.checkpoint.at, savedStatus: loaded.checkpoint.state.status, recovered: loaded.recovered };
    stopLord(world.checkpoint.state);
    const migrateBinding=world.checkpoint.state.agency?.modelBinding!=='dialogue';
    if(migrateBinding)ensureAgency(world.checkpoint.state);
    if (loaded.recovered||migrateBinding) this.store.save(player, world.checkpoint);
    this.worlds.set(player, world); return world;
  }
  private advance(world: World) {
    let current = world.checkpoint;
    const now = this.now();
    // A saved direction has no live lease. Expiration is wall time, independent of speed.
    if (current.state.status !== 'playing' || world.lordInputUntil === undefined || now >= world.lordInputUntil) {
      stopLord(current.state); world.lordInputUntil = undefined;
    }
    if (now < current.at) { world.catchingUp = false; return; }
    if (current.pauseUntil !== null && now > current.pauseUntil) {
      current = { ...current, state: { ...current.state, status: current.state.status === 'paused' ? 'playing' : current.state.status },
        at: Math.max(current.at, current.pauseUntil), pauseUntil: null, pauseOwner: null };
    }
    if (current.state.status === 'playing') {
      let state = current.state;
      const steps = Math.min(this.maxSteps, Math.floor((now - current.at) / 100));
      if (steps > 0) {
        this.initializeMemory(state);
        state = advanceGameSteps(state, steps * current.speed, state.mode === 'rules' ? baselinePolicy : this.policy);
      }
      current = { ...current, state, at: state.status === 'playing' ? current.at + steps * 100 : now };
    } else current = { ...current, at: now };
    world.checkpoint = current;
    // Compare against this batch's fixed target. Computation and SQLite latency
    // belong to the next tick, not to an unfinished offline replay.
    world.catchingUp = current.state.status === 'playing' && now - current.at >= 100;
  }
  private persist(player: string, world: World, operation?: string) {
    try { this.store.save(player, world.checkpoint, operation); }
    catch (error) {
      this.worlds.delete(player);
      this.errors.set(player, '世界保存失败，已停止该世界推进并保留原存档');
      throw error;
    }
    world.savedAt = world.checkpoint.at; world.savedStatus = world.checkpoint.state.status; this.errors.delete(player);
  }
  private initializeMemory(state: Checkpoint['state']) {
    if (state.agency?.legacyImported) return;
    const agency=ensureAgency(state);
    const migrated=(id:typeof NPC_IDS[number],category:'social'|'dialogue',fact:string,actor:string,audience:string[],at:number,salience=.6)=>{
      if(!agencyPerson(state,id).memory.recent.some(e=>e.at===at&&e.actorId===actor&&e.fact===fact))remember(state,id,category,fact,actor,audience,category==='social'||actor===id?'experienced':'heard','从旧存档仍存在的记录恢复。',salience,at);
    };
    for (const npc of state.npcs) {
      agencyPerson(state, npc.id);
      for (const m of npc.mind?.memories ?? []) migrated(npc.id,'social',m.fact,m.actorId??npc.id,[npc.id],m.at,m.salience);
    }
    for(const m of state.social.memories)migrated(m.npcId,'social',m.text,m.otherId??'player',[m.npcId],m.at,.7);
    for(const thread of state.social.threads)for(const line of thread.lines){
      const name=line.speaker==='player'?'领主':state.npcs.find(n=>n.id===line.speaker)!.name;
      const audience=[...new Set([...thread.participants,...(line.speaker==='player'?[]:[line.speaker])])];
      for(const id of audience)migrated(id,'dialogue',`${name}说：${line.text}`,line.speaker,audience,line.at);
    }
    agency.legacyImported=true;
  }
  read(player: string, owner?: string): WorldSnapshot {
    const world = this.get(player);
    if (!world) return { state: null, revision: 0, speed: 1, savedAt: 0, recovered: false, temporaryPause: false, catchingUp: false };
    this.advance(world);
    if (owner && world.checkpoint.pauseOwner === owner && world.checkpoint.pauseUntil !== null) {
      world.checkpoint = { ...world.checkpoint, pauseUntil: this.now() + 3000 };
    }
    if (world.savedStatus !== world.checkpoint.state.status
      || (world.checkpoint.state.status === 'playing' || world.checkpoint.pauseUntil !== null) && world.checkpoint.at - world.savedAt >= 1000) this.persist(player, world);
    if (this.errors.has(player)) throw new Error(this.errors.get(player));
    return { state: world.checkpoint.state, revision: world.checkpoint.revision, speed: world.checkpoint.speed,
      dialogueScope: `${world.checkpoint.journal?.generation}:${world.checkpoint.journal?.branch}`,
      dialogues: world.checkpoint.dialogues ?? [],
      savedAt: world.savedAt, recovered: world.recovered, temporaryPause: world.checkpoint.pauseUntil !== null,
      catchingUp: world.catchingUp ?? false };
  }
  mutate(player: string, revision: number, operation: string, action: WorldAction, owner: string): WorldSnapshot {
    let world = this.get(player);
    const lordInput = action.type === 'command' && action.command?.type === 'lord-input';
    if (!lordInput && this.store.seen(player, operation)) return this.read(player, owner);
    if (revision !== (world?.checkpoint.revision ?? 0)) throw new WorldConflict();
    if (world && action.type !== 'reset'&&action.type!=='agency-model') this.advance(world);
    // Immutable generated replies do not change simulation behavior. Persist them
    // even during replay; scope validation below still rejects another world.
    if (world?.catchingUp && action.type !== 'start' && action.type !== 'reset' && action.type !== 'agency-model' && action.type !== 'dialogue-result') throw new Error('正在补算离线世界，请稍后再操作');
    const now = this.now();
    let next: Checkpoint;
    let lordInputUntil = world?.lordInputUntil;
    if (action.type === 'start' || action.type === 'import' || action.type === 'reset') {
      if (action.type === 'import' && world) throw new WorldConflict();
      const state = restoreGameState(action.type === 'reset'
        ? createGame({ seed: 64138, npcSettings: action.npcSettings })
        : action.type === 'start' ? createGame(action.options) : action.state);
      if (!state) throw new Error('初始进度校验失败');
      if(action.type==='import')delete state.socialLife; // Untrusted legacy uploads cannot mint server-owned options or promises.
      ensureAgency(state);
      if(action.type==='reset'&&world?.checkpoint.state.agency?.settingsRevision){
        const previous=world.checkpoint.state.agency,a=ensureAgency(state);
        // Reset runtime progress without changing the player's model settings.
        a.enabled=previous.enabled;a.cognition=previous.cognition;a.modelId=previous.modelId;a.modelBinding=previous.modelBinding;a.settingsRevision=previous.settingsRevision+1;
      }
      next = { version: 1, state: { ...state, status: action.type === 'import' ? state.status : 'playing' },
        revision: revision + 1, speed: 1, at: now, pauseUntil: null, pauseOwner: null };
      stopLord(next.state); lordInputUntil = undefined;
    } else {
      if (!world) throw new Error('请先开始旅程');
      next = { ...world.checkpoint, revision: revision + 1 };
      if (action.type === 'speed') { if (![1, 2, 4].includes(action.speed)) throw new Error('速度无效'); next.speed = action.speed; }
      else if (action.type === 'pause') {
        if (typeof action.paused !== 'boolean') throw new Error('暂停操作无效');
        if (['playing', 'paused'].includes(next.state.status)) {
          // A modal cannot replace an explicit pause or another tab's modal lease.
          if (action.temporary && action.paused && next.state.status === 'paused') return this.read(player, owner);
          if (action.temporary && !action.paused && next.pauseOwner !== owner) return this.read(player, owner);
          next.state = { ...next.state, status: action.paused ? 'paused' : 'playing' };
          stopLord(next.state); lordInputUntil = undefined;
          next.pauseUntil = action.paused && action.temporary ? now + 3000 : null;
          next.pauseOwner = next.pauseUntil === null ? null : owner;
        }
      } else if(action.type==='agency-model'){
        if(typeof action.modelId!=='string'||!action.modelId.length||action.modelId.length>100)throw new Error('认知绑定模型无效');
        next.state=structuredClone(next.state);this.initializeMemory(next.state);
        const a=ensureAgency(next.state);a.modelId=action.modelId;a.cognition=true;a.modelBinding='dialogue';a.settingsRevision++;
        this.scheduler.cancelPrefix(`${player}:`);
        for(const p of Object.values(a.people)){p.appraisal=null;p.appraisalStatus='idle';p.nextAppraisalAt=next.state.elapsed;}
      } else if (action.type === 'agency-settings') {
        if(typeof action.enabled!=='boolean'||typeof action.cognition!=='boolean'||!(action.modelId===null||typeof action.modelId==='string'&&action.modelId.length<=100))throw new Error('NPC 自主设置无效');
        next.state=structuredClone(next.state);this.initializeMemory(next.state);
        const a=ensureAgency(next.state);a.enabled=action.enabled;a.cognition=action.cognition;a.modelId=action.modelId;a.settingsRevision++;
        this.scheduler.cancelPrefix(`${player}:`);
        for(const n of next.state.npcs){const p=agencyPerson(next.state,n.id);p.invitation=null;p.appraisalStatus='idle';p.nextAppraisalAt=next.state.elapsed;
          if(!a.enabled&&n.mind){n.mind.intent.until=next.state.elapsed;n.mind.intent.kind='cooperate';n.command=null;n.action=null;n.progress=0;n.actionDuration=0;n.decisionIn=0;delete n.worldRoute;}}
      } else if (action.type === 'command') {
        if(action.command?.type==='social-chat'||action.command?.text!==undefined)throw new Error('请使用提供的回复选项');
        this.initializeMemory(next.state);
        const command = action.command;
        if (!command || !['collective-reply', 'gate-toggle', 'hunt', 'assign', 'praise', 'urge', 'feed', 'rescue', 'priority', 'select', 'recall', 'move', 'weather', 'social-open', 'social-reply', 'social-chat', 'lord-input'].includes(command.type)
          || command.groupId !== undefined && (!Number.isSafeInteger(command.groupId) || command.groupId < 1)
          || command.npcId !== undefined && !NPC_IDS.includes(command.npcId)
          || command.action !== undefined && command.action !== null && !ACTIONS.includes(command.action)
          || command.priority !== undefined && !['wood', 'food', 'balanced'].includes(command.priority)
          || command.weather !== undefined && !['clear', 'wind', 'rain', 'storm'].includes(command.weather)
          || command.target !== undefined && (!Number.isFinite(command.target.x) || !Number.isFinite(command.target.y))
          || command.playerId !== undefined && command.playerId !== LOCAL_PLAYER_ID
          || command.direction !== undefined && (!command.direction || !Number.isFinite(command.direction.x) || !Number.isFinite(command.direction.y)
            || Math.abs(command.direction.x) > 1 || Math.abs(command.direction.y) > 1)
          || command.text !== undefined && (typeof command.text !== 'string' || command.text.length > 160)) throw new Error('游戏操作无效');
        next.state = issueCommand(next.state, command);
        if(command.type==='social-open')openPlayerConversation(next.state,command.npcId??next.state.selectedNpc);
        if (command.type === 'lord-input') {
          const moving = next.state.status === 'playing' && command.direction && (command.direction.x !== 0 || command.direction.y !== 0);
          lordInputUntil = moving ? now + LORD_INPUT_LEASE_MS : undefined;
          if (!moving) stopLord(next.state);
        }
      } else if(action.type==='social-refresh'){
        if(action.scope!==`${next.journal?.generation}:${next.journal?.branch}`)throw new Error('回复选项已过期');
        next.state=structuredClone(next.state);
        const social=next.state.socialLife,set=social?.choices.find(c=>c.id===action.setId);
        if(!social||!set||set.expiresAt<=next.state.elapsed||social.messages.find(m=>m.id===set.messageId)?.replies.player!=='pending')throw new Error('回复选项已过期，请重新选择');
        if(social.previousChoices&&now-social.previousChoices.refreshedAt<3000)throw new Error('正在更换选项，请稍后再试');
        social.previousChoices={messageId:set.messageId,texts:set.options.map(o=>o.text),refreshedAt:now};
        social.choices=social.choices.filter(c=>c.messageId!==set.messageId);
      } else if(action.type==='social-choice'){
        if(action.scope!==`${next.journal?.generation}:${next.journal?.branch}`)throw new Error('回复选项已过期');
        next.state=structuredClone(next.state);
        const set=next.state.socialLife?.choices.find(c=>c.id===action.setId),choice=set?.options.find(c=>c.id===action.choiceId);
        if(!set||!choice||set.expiresAt<=next.state.elapsed||!next.state.npcs.some(n=>n.id===set.npcId&&n.alive)||next.state.socialLife?.messages.find(m=>m.id===set.messageId)?.replies.player!=='pending')throw new Error('回复选项已过期，请重新选择');
        respond(next.state,set.messageId,'player',choice,'player',set.version);
      } else if (action.type === 'dialogue-result') {
        const scope = `${next.journal?.generation}:${next.journal?.branch}`;
        if (action.scope !== scope) throw new Error('对话所属世界已变化，旧回复未写入');
        const result = action.result;
        if (!validDialogueRecord(result) || !NPC_IDS.includes(result.npcId) || !validDialogueLine(result.text)
          || result.at > next.state.elapsed + 1) throw new Error('对话结果无效');
        const existing = next.dialogues?.find(item => item.id === result.id);
        if (existing) return this.read(player, owner);
        if(result.replyToId){
          const parent=next.dialogues?.find(item=>item.id===result.replyToId);
          if(!parent||parent.threadId!==result.threadId||parent.lineId!>=result.lineId!||!result.targetIds?.includes(parent.npcId))throw new Error('对方的前置发言尚未发布，不能保存回复');
        }
        // No speech/fingerprint/expiry check: the result answers its immutable input.
        // In particular this action never writes NPC behavior, command or speech.
        next.dialogues = retainDialogueRecords([...(next.dialogues ?? []), result], next.state);
      } else if (action.type === 'caption') {
        const npc = next.state.npcs.find(n => n.id === action.npcId);
        if (!npc || npc.speech !== action.beforeSpeech || npc.speechUntil !== action.beforeUntil || fingerprint(next.state, npc) !== action.beforeFingerprint || !validDialogueLine(action.text)
          || !['playing', 'paused'].includes(next.state.status) || !npc.alive || !captionWithinWindow(npc, next.state.elapsed, action.threadId)) return this.read(player, owner);
        next.state = { ...next.state, npcs: next.state.npcs.map(n => n.id === npc.id ? { ...n, speech: action.text, speechUntil: Math.max(n.speechUntil, next.state.elapsed + 3.5),
          speechOrigin: { text: action.text, until: Math.max(n.speechUntil, next.state.elapsed + 3.5), source: action.source } } : n),
          social: { ...next.state.social, threads: next.state.social.threads.map(thread => thread.id === action.threadId ? { ...thread,
            lines: thread.lines.map(line => line.id === action.lineId && line.speaker === npc.id && line.text === npc.speech ? { ...line, text: action.text, source: action.source } : line) } : thread) } };
        reviseSpeechMemory(next.state, npc.id, npc.speech, action.text);
      } else throw new Error('未知世界操作');
    }
    const candidate: World = { checkpoint: next, savedAt: world?.savedAt ?? 0, savedStatus: world?.savedStatus ?? next.state.status, recovered: action.type === 'reset' ? false : world?.recovered ?? false, lordInputUntil };
    // Held-input renewals are ephemeral; position is checkpointed at the normal cadence.
    if (action.type === 'reset') {
      this.scheduler.cancelPrefix(`${player}:`);
      this.store.save(player, next, operation, true);
      candidate.savedAt = next.at; candidate.savedStatus = next.state.status; this.errors.delete(player);
    } else if (!lordInput) this.persist(player, candidate, operation);
    this.worlds.set(player, candidate);
    return this.read(player, owner);
  }
  tick() {
    for (const player of this.store.players()) {
      try { this.read(player); } catch (error) { this.errors.set(player, error instanceof Error ? error.message : String(error)); }
    }
    for(const result of this.scheduler.drain()){
      const {ticket}=result;const world=this.get(ticket.player);if(!world||this.errors.has(ticket.player))continue;
      const j=world.checkpoint.journal;
      if(j?.generation!==ticket.generation||j.branch!==ticket.branch)continue;
      const state=structuredClone(world.checkpoint.state),accepted=acceptAppraisal(state,ticket,this.appraisalGate&&!this.appraisalGate(result.raw)?null:result.raw);
      const person=state.agency?.people[ticket.npcId];if(person)person.nextAppraisalAt=Math.max(person.nextAppraisalAt,state.elapsed+15);
      if(!accepted){if(person)person.appraisalStatus='fallback';world.checkpoint={...world.checkpoint,state};continue;}
      const candidate:World={...world,checkpoint:{...world.checkpoint,state,appraisals:[{id:ticket.id,sequence:state.agency!.sequence,payload:{ticket,result:accepted,acceptedAt:state.elapsed}}]}};
      try{this.persist(ticket.player,candidate);this.worlds.set(ticket.player,candidate);}catch{/* persist quarantines this world until reload */}
    }
    const entries=[...this.worlds];
    const cursor=entries.findIndex(([player])=>player===this.nativePlayerCursor);
    const ordered=cursor<0?entries:[...entries.slice(cursor+1),...entries.slice(0,cursor+1)];
    if(this.provider)for(const [player,world]of ordered){
      const state=world.checkpoint.state,a=state.agency,j=world.checkpoint.journal;
      if(state.status!=='playing'||!a?.cognition||!a.modelId||!j||this.errors.has(player)||world.catchingUp||this.socialBusy.has(player))continue;
      const native=a.modelId.startsWith('native:');
      for(const npc of [...state.npcs].sort((x,y)=>(a.people[x.id]?.nextAppraisalAt??0)-(a.people[y.id]?.nextAppraisalAt??0))){
        if(native&&this.nativeAppraisalBusy)break;
        const p=agencyPerson(state,npc.id);
        if(!npc.alive||state.elapsed<p.nextAppraisalAt||!p.memory.recent.some(e=>e.sequence>p.appraisalThrough&&e.category!=='intent'&&e.source!=='self'))continue;
        try{
          const lastPlayer=p.memory.recent.filter(e=>e.actorId==='player'&&e.category==='dialogue').at(-1)?.fact;
          const query=lastPlayer??npc.mind?.intent.reason??'休息分工承诺';
          const stored=this.store.evidence(player,j,npc.id,state.elapsed,query);
          const context=buildAppraisalContext(state,npc,stored);if(!context.evidence.length)continue;
          const ticket:AppraisalTicket={id:randomUUID(),player,generation:j.generation,branch:j.branch,npcId:npc.id,at:state.elapsed,through:p.memory.watermark,
            settingsRevision:a.settingsRevision,signature:appraisalSignature(npc,state),evidence:context.evidence,targets:context.targets,
            ...(native?{validFor:60*world.checkpoint.speed}:{})};
          const modelId=a.modelId;
          if(this.scheduler.schedule(`${player}:${npc.id}`,ticket,context.prompt,(prompt,signal)=>{
            if(native){this.nativeAppraisalBusy=true;this.nativePlayerCursor=player;}
            return Promise.resolve().then(()=>this.provider!(player,modelId,prompt,signal)).finally(()=>{if(native)this.nativeAppraisalBusy=false;});
          },native?60000:20000)){p.nextAppraisalAt=state.elapsed+15;p.appraisalStatus='pending';}
        }catch{p.appraisalStatus='fallback';p.nextAppraisalAt=state.elapsed+15;}
      }
    }
  }
  memories(player:string,npc:string,before?:number,identity?:{generation:string;branch:string}) {
    if(!NPC_IDS.includes(npc as typeof NPC_IDS[number]))throw new Error('角色不存在');
    const page=this.store.memories(player,npc,before);
    if(identity&&(identity.generation!==page.generation||identity.branch!==page.branch))throw new Error('记忆分页已过期，请重新读取');
    return page;
  }
  history(player: string) { return this.store.history(player); }
  conversations(player:string,page:number,through?:number,scope?:string) { this.read(player);return this.store.conversations(player,page,through,scope); }
  close() { if (!this.closed) { this.closed = true; this.scheduler.close(); this.store.close(); } }
}
