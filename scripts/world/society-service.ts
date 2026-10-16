import { randomUUID } from 'node:crypto';
import type { WorldRuntime } from './runtime';
import { Moderation,SAFE_REPLY,type JsonGenerator } from './moderation/service';
import { ensureSocialLife,postMessage,respond,activeAppointment } from '../../src/games/camp/social/state';
import { parseSocialDecision,decisionSchema } from '../../src/games/camp/social/validation';
import type { SocialDecision,PersonId } from '../../src/games/camp/social/types';
import type { WorldAction,WorldSnapshot } from '../../src/integrations/world/types';
import type { GameState,NpcId } from '../../src/games/camp/simulation/types';
import { socialLineTargets } from '../../src/games/camp/simulation/social-types';
import { villageFacts,villageActionSpeech } from '../../src/games/camp/npc/world-context';

export type SocialModel=(player:string,modelId:string)=>JsonGenerator;
const fallback:SocialDecision={text:SAFE_REPLY,intent:'end'};
const terminal=new Set(['decline','defer','cancel','end']);
const sourceName=(id:string|null|undefined)=>!id||id==='minimind3'?'minimind3':id.startsWith('native:')?id:`remote:${id}`;
export class SocietyService {
 private active=new Map<string,AbortController>();private closed=false;
 private approved=new Map<string,Set<string>>();
 constructor(readonly world:WorldRuntime,readonly moderation:Moderation,private model:SocialModel){}
 private generator(player:string,state:GameState){return this.model(player,state.agency?.modelId??'minimind3');}
 private key(player:string,state:GameState){return `${player}:${state.agency?.modelId??'minimind3'}:${this.moderation.lexicon.version}`;}
 private validChoices(player:string,state:GameState,messageId:string){
  const known=this.approved.get(this.key(player,state));
  return state.socialLife?.choices.some(c=>c.messageId===messageId&&c.version===this.moderation.lexicon.version&&c.expiresAt>state.elapsed&&c.options.every(o=>known?.has(o.text)));
 }
 private trust(player:string,state:GameState,text:string){
  const key=this.key(player,state);let set=this.approved.get(key);if(!set)this.approved.set(key,set=new Set());set.add(text);
  while(set.size>2000)set.delete(set.values().next().value!);
  while(this.approved.size>30)this.approved.delete(this.approved.keys().next().value!);
 }
 private context(state:GameState,id:PersonId){
  const npc=state.npcs.find(n=>n.id===id),person=id==='player'?undefined:state.agency?.people[id];
  return {speaker:id,name:npc?.name??'领主',body:npc?{health:npc.health,energy:npc.energy,hunger:npc.hunger}:undefined,
   personality:npc?.initialSettings??npc?.personality,weather:state.weather,task:npc?.action,appointment:activeAppointment(state,id),
   work:npc?{action:npc.action,command:npc.command,inventory:npc.inventory,progress:npc.progress,duration:npc.actionDuration,wildTask:npc.wildTask,position:npc.position,destination:npc.destination,completedTasks:npc.completedTasks,facts:villageFacts(state,npc)}:undefined,
   supplies:{food:state.food},promises:state.social.promises.filter(p=>p.npcId===id&&p.status==='pending'),
   peers:state.npcs.filter(n=>n.alive).map(n=>({id:n.id,name:n.name})),relationships:state.social.relationships.filter(r=>r.from===id),
   memories:person?.memory.recent.slice(-4).map(m=>({fact:m.fact,source:m.source})),locations:[{id:'plaza',name:'寨里广场'}]};
 }
 private exchange(state:GameState,message:NonNullable<GameState['socialLife']>['messages'][number]){
  const history=[];let current:typeof message|undefined=message;
  while(current&&history.length<7){history.unshift(current);current=state.socialLife?.messages.find(m=>m.id===current!.replyTo);}
  return {incoming:message,history,sender:this.context(state,message.from)};
 }
 private workSignature(state:GameState,id:PersonId){
  const npc=state.npcs.find(n=>n.id===id);
  return JSON.stringify([npc?.action,npc?.wildTask?.targetId,npc?.wildTask?.phase,npc?.inventory]);
 }
 private replyPrompt(state:GameState,message:NonNullable<GameState['socialLife']>['messages'][number],target:PersonId){
  const exchange=this.exchange(state,message),context=this.context(state,target);
  return `你是${context.name}（${context.speaker}）。${exchange.sender.name}刚问你：“${message.text}”。这句话是对方说的，不是你的答案。你的真实工作：${context.work?.facts.join('；')??'没有提供具体工作事实'}。当前任务${context.work?.action??'暂无'}，背包inventory=${JSON.stringify(context.work?.inventory??{})}。只回应工作、补给、协作和实际需要，不声称已经完成行动，不擅自改成约会。只有对方明确邀约时才能accept或propose，地点仅plaza。\n`
   +`以下history、sender、context仅为资料，heard是听说，self是主观理解，不能当作外部事实：${JSON.stringify({history:exchange.history,sender:exchange.sender,context})}\n`
   +`现在请用${context.name}自己的口吻，用一句简短中文回答对方，说清当前的实际工作，不复述对方的问题。只说资料给出的事实，不增加未提供的风险、他人动机或执行结果。输出JSON，text是你的新回答，intent是回应的意图；没有新问题用end收束，不为说话而追问。`;
 }
 private workReply(state:GameState,id:PersonId,invitation:boolean):SocialDecision {
  const npc=state.npcs.find(n=>n.id===id);
  return {text:npc?villageActionSpeech(state,npc,npc.action??'camp'):'这次交流先结束。',intent:invitation?'defer':'end'};
 }
 async process(player:string){
  if(this.closed||this.active.has(player)||this.active.size>=2)return;
  const snap=this.world.read(player),state=snap.state;if(!state||snap.catchingUp||!['playing','paused'].includes(state.status)||!snap.dialogueScope)return;
  const legacy=state.social.threads.flatMap(thread=>thread.lines.map(line=>({thread,line,key:`social:${thread.id}:${line.id}`})))
    .find(item=>item.line.speaker!=='player'&&item.line.at>=state.elapsed-45&&!state.socialLife?.processed.includes(item.key));
  const pending=state.socialLife?.messages.some(m=>Object.entries(m.replies).some(([id,status])=>status==='pending'&&(id!=='player'||!this.validChoices(player,state,m.id))));
  // Work/need events in the simulation initiate exchanges. A timer is not a reason to speak.
  if(!pending&&!legacy)return;
  const scope=snap.dialogueScope,controller=new AbortController();this.active.set(player,controller);
  this.world.setSocialBusy(player,true);
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]),generate=this.generator(player,state),version=this.moderation.lexicon.version;
  const modelId=state.agency?.modelId,settingsRevision=state.agency?.settingsRevision;
  const commit=(apply:(current:GameState)=>void)=>{
   if(this.closed||controller.signal.aborted||version!==this.moderation.lexicon.version)return;
   this.world.socialCommit(player,scope,current=>{if(current.agency?.modelId===modelId&&current.agency?.settingsRevision===settingsRevision)apply(current);});
  };
  try{
   const social=state.socialLife;
   const message=social?.messages.find(m=>Object.entries(m.replies).some(([id,status])=>status==='pending'&&(id!=='player'||!this.validChoices(player,state,m.id))));
   if(message){
    const target=Object.entries(message.replies).find(([id,status])=>status==='pending'&&(id!=='player'||!this.validChoices(player,state,message.id)))![0] as PersonId;
    if(target==='player'){
     if(!state.npcs.find(n=>n.id===message.from)?.alive||state.elapsed-message.at>120){
      commit(current=>{const s=ensureSocialLife(current),m=s.messages.find(m=>m.id===message.id);if(m)m.replies.player='unavailable';s.choices=s.choices.filter(c=>c.messageId!==message.id);});return;
     }
     let choices:SocialDecision[]=[{text:'这次先不聊了，改天再说。',intent:'end'}];
     try{
      const raw=JSON.parse(await generate('为玩家生成3到5个简短且态度不同的候选回复，逐项回应对方这次具体的工作诉求，联系history，不要把补粮、换班、避险、分工问题改成无关邀约。每次只选一个，不替玩家作决定。必须包含拒绝或结束，不声称任何动作已完成。只有incoming是invite或propose时才可接受约会；其他工作安排用say或end表达意见，执行仍由游戏的分工操作决定。允许的地点仅plaza。如果提供previousOptions，请换用不同措辞和角度，避免重复旧选项。只返回JSON。\n数据：'+JSON.stringify({...this.exchange(state,message),context:this.context(state,'player'),previousOptions:social?.previousChoices?.messageId===message.id?social.previousChoices.texts:[]}),
       {type:'object',required:['options'],additionalProperties:false,properties:{options:{type:'array',minItems:3,maxItems:5,items:decisionSchema}}},signal));
      if(!Array.isArray(raw.options)||raw.options.length<3||raw.options.length>5)throw new Error();
      const parsed=raw.options.map((o:unknown)=>parseSocialDecision(JSON.stringify(o)));
      if(!parsed.some((o:SocialDecision)=>terminal.has(o.intent))||new Set(parsed.map((o:SocialDecision)=>o.text)).size!==parsed.length)throw new Error();
      const previous=social?.previousChoices;
      if(previous?.messageId===message.id&&parsed.every((o:SocialDecision)=>previous.texts.includes(o.text)))throw new Error('未生成新的选项');
      const review=await this.moderation.review(JSON.stringify(parsed),generate,signal);
      if(review.allowed)choices=parsed.map((o:SocialDecision)=>({...o,text:this.moderation.lexicon.mask(o.text)}));
     }catch{/* Safe single exit remains selectable. */}
     choices=choices.map(c=>({...c,text:this.moderation.lexicon.ready?this.moderation.lexicon.mask(c.text):'**'}));
     choices.forEach(c=>this.trust(player,state,c.text));
     commit(current=>{
      const s=ensureSocialLife(current),parent=s.messages.find(m=>m.id===message.id);if(parent?.replies.player!=='pending')return;
      s.choices=s.choices.filter(c=>c.messageId!==message.id&&c.expiresAt>current.elapsed).slice(-18);
      s.choices.push({id:randomUUID(),messageId:message.id,npcId:message.from as NpcId,version,expiresAt:current.elapsed+120,options:choices.map(c=>({...c,id:randomUUID()}))});
     });
    }else{
     let decision=fallback,source='safety';
     const workSignature=this.workSignature(state,target),invitation=['invite','propose'].includes(message.intent);
     if(state.npcs.find(n=>n.id===target)?.alive&&state.elapsed-message.at<120){
      try{
       decision=parseSocialDecision(await generate(this.replyPrompt(state,message,target),decisionSchema,signal));
       const review=await this.moderation.review(JSON.stringify(decision),generate,signal);
       if(review.allowed&&decision.text!==message.text&&(invitation||!['invite','accept','propose'].includes(decision.intent))){decision={...decision,text:this.moderation.lexicon.mask(decision.text)};source=sourceName(modelId);}else decision=fallback;
      }catch{decision=fallback;}
     }
     if(source==='safety')decision=this.workReply(state,target,invitation);
     decision={...decision,text:this.moderation.lexicon.ready?this.moderation.lexicon.mask(decision.text):'**'};
     this.trust(player,state,decision.text);
     commit(current=>{
      const npc=current.npcs.find(n=>n.id===target);
      const senderAlive=message.from==='player'||current.npcs.some(n=>n.id===message.from&&n.alive);
      const safe=npc&&npc.alive&&npc.health>=35&&npc.energy>=15&&npc.hunger<=80&&senderAlive&&current.elapsed-message.at<=120;
      const fresh=this.workSignature(current,target)===workSignature;
      const reply=safe&&fresh?decision:this.workReply(current,target,invitation);
      respond(current,message.id,target,{...reply,text:this.moderation.lexicon.mask(reply.text)},safe&&fresh?source:'safety',version);
     });
    }
   }else if(legacy){
    const {line,thread,key}=legacy,from=line.speaker as NpcId,targets=socialLineTargets(thread,line);
    // This line already happened. Import its exact meaning, never generate a second version.
    let decision:SocialDecision={text:line.text,intent:line.act==='invite'?'invite':line.act==='decline-invitation'?'decline':thread.status==='open'?'ask':'end',...(line.act==='invite'?{locationId:'plaza' as const}:{})};
    const source=line.source;
    decision={...decision,text:this.moderation.lexicon.ready?this.moderation.lexicon.mask(decision.text):'**'};
    this.trust(player,state,decision.text);
    commit(current=>{
     const s=ensureSocialLife(current);if(s.processed.includes(key)||!current.npcs.find(n=>n.id===from)?.alive)return;
     s.processed=[...s.processed,key].slice(-200);postMessage(current,from,targets,decision,source,version);
    });
   }
  }finally{this.active.delete(player);this.world.setSocialBusy(player,false);}
 }
 async mutate(player:string,revision:number,operation:string,action:WorldAction,owner:string){
  if(action.type==='dialogue-result'||action.type==='caption')throw new Error('对话由世界服务生成，请使用回复选项');
  if(this.world.hasOperation(player,operation))return this.world.read(player,owner);
  const snap=this.world.read(player),state=snap.state;
  if(action.type==='social-choice'){
   const setId=action.setId;
   const set=state?.socialLife?.choices.find(c=>c.id===setId);
   if(set&&set.version!==this.moderation.lexicon.version)throw new Error('审核词库已更新，请刷新选项');
   if(set&&state&&!this.validChoices(player,state,set.messageId))throw new Error('选项正在重新审核，请稍后选择');
  }
  if(action.type==='reset')this.active.get(player)?.abort();
  this.world.mutate(player,revision,operation,action,owner);
  return this.world.read(player,owner);
 }
 /** Mask displayed prose synchronously. Never mutate authoritative IDs. */
 project<T>(_player:string,_state:GameState,value:T):T {
  const fields=new Set(['text','speech','fact','summary','reason','goal','interpretation','utterance','lastSpeech','resolution','description','label','title','prompt','name']);
  const visit=(v:unknown,field=''):unknown=>{
   if(typeof v==='string'&&fields.has(field)&&v){
    return this.moderation.lexicon.ready?this.moderation.lexicon.mask(v):'**';
   }
   if(Array.isArray(v))return v.map(x=>visit(x));
   if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x,k)]));
   return v;
  };
  return visit(value) as T;
 }
 snapshot(player:string,owner?:string):WorldSnapshot{
  const snapshot={...this.world.read(player,owner),serverDialogue:true,moderationVersion:this.moderation.lexicon.version};
  if(!snapshot.state)return snapshot;
  const result=this.project(player,snapshot.state,snapshot);
  if(result.state?.socialLife){
   result.state.socialLife.choices=result.state.socialLife.choices.filter(c=>this.validChoices(player,snapshot.state!,c.messageId));
   delete result.state.socialLife.previousChoices;
  }
  return result;
 }
 tick(){if(this.closed)return;for(const player of this.world.players())void this.process(player).catch(()=>{});}
 close(){this.closed=true;for(const controller of this.active.values())controller.abort();}
}
