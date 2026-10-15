import type { GameCommand, GameState, NpcId } from './games/camp/simulation/types';
import { currentSpeechSource } from './games/camp/dialogue/source';
import type { DialogueRecord } from './games/camp/dialogue/records';
import { retainWorldMessages } from './worldMessageFilters';
import { socialLineTargets } from './games/camp/simulation/social-types';

export type MessageKind = 'npc' | 'player' | 'info' | 'good' | 'warning' | 'danger' | 'error';
export interface WorldReplyTarget {npcId:NpcId;threadId?:number;}
export interface WorldMessage { id: number; kind: MessageKind; speaker: string; text: string; time: number; source?: string; recipients?:string[];replyTo?:WorldReplyTarget }
export const worldMessageText=(message:WorldMessage)=>message.recipients?.length?`${message.recipients.map(name=>`@${name}`).join(' ')} ${message.text}`:message.text;
const recipientNames=(game:GameState,ids:readonly string[])=>[...new Set(ids)].map(id=>id==='player'?'领主':game.npcs.find(n=>n.id===id)?.name).filter((name):name is string=>!!name);
const actions: Record<string,string> = { wood:'伐木',food:'采食',fire:'添柴',eat:'进食',rest:'休息',help:'互助',camp:'返回营地',explore:'探索' };

/** Presentation-only history. Never feeds back into the deterministic world. */
export class WorldMessageStore {
  constructor(private managedDialogue = false) {}
  private dialogueRecords = new Map<string, DialogueRecord>();
  private pending = new Map<string, number>();
  private dialogueErrors = new Map<string, string>();
  dialogueError(id: string) { return this.dialogueErrors.get(id); }
  private bubbles = new Map<string, { text: string; source: string; until: number }>();
  dialogue(id: string) { return this.dialogueRecords.get(id); }
  bubble(npcId: string) { return this.bubbles.get(npcId); }
  waiting(id: string, name: string, at: number, error?: string) {
    if (error) this.dialogueErrors.set(id, error); else this.dialogueErrors.delete(id);
    const messageId = this.pending.get(id) ?? this.nextId++;
    this.pending.set(id, messageId);
    const message: WorldMessage = { id: messageId, kind: error ? 'error' : 'info', speaker: name,
      text: error ? `对话生成或保存失败：${error}` : '正在生成回复…', time: at };
    this.messages = retainWorldMessages([...this.messages.filter(item => item.id !== messageId), message]); this.notify();
  }
  captureDialogues(records: readonly DialogueRecord[], game: GameState) {
    for (const record of records) {
      const pendingId = this.pending.get(record.id);
      if (pendingId !== undefined) this.messages = this.messages.filter(item => item.id !== pendingId);
      this.pending.delete(record.id);
      this.dialogueErrors.delete(record.id);
      const old=this.dialogueRecords.get(record.id);
      if (old) {
        if(old.text!==record.text){
          this.dialogueRecords.set(record.id,record);
          this.messages=this.messages.map(m=>m.kind==='npc'&&m.text===old.text?{...m,text:record.text}:m);
          const bubble=this.bubbles.get(record.npcId);if(bubble?.text===old.text)this.bubbles.set(record.npcId,{...bubble,text:record.text});
          this.notify();
        }else if(pendingId!==undefined)this.notify();
        continue;
      }
      this.dialogueRecords.set(record.id, record);
      this.bubbles.set(record.npcId, { text: record.text, source: record.source, until: game.elapsed + 8 });
      const thread=game.social.threads.find(t=>t.id===record.threadId);
      const line=thread?.lines.find(l=>l.id===record.lineId);
      const targets=record.targetIds??(thread?socialLineTargets(thread,line??{speaker:record.npcId}):[]);
      this.append('npc', record.text, record.at, game.npcs.find(n => n.id === record.npcId)?.name ?? record.npcId, record.source,recipientNames(game,targets.filter(id=>id!==record.npcId)),targets.includes('player')?{npcId:record.npcId,...(record.threadId!==undefined?{threadId:record.threadId}:{})}:undefined);
    }
    const retained = new Set(records.map(record => record.id));
    for (const id of this.dialogueRecords.keys()) if (!retained.has(id)) this.dialogueRecords.delete(id);
    while (this.pending.size > 100) this.pending.delete(this.pending.keys().next().value!);
    while (this.dialogueErrors.size > 100) this.dialogueErrors.delete(this.dialogueErrors.keys().next().value!);
  }
  private messages: WorldMessage[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();
  private eventId = 0;
  private lineTexts = new Map<number,string>();
  private speeches = new Map<string,string>();
  private seenSpeeches = new Set<string>();
  private conditions = new Map<string,string>();
  private societyMessages = new Map<string,number>();
  captureSociety(game:GameState){
    for(const m of game.socialLife?.messages??[]){
      const id=this.societyMessages.get(m.id);
      const recipients=recipientNames(game,m.to),speaker=m.from==='player'?'领主':game.npcs.find(n=>n.id===m.from)?.name??m.from;
      if(id!==undefined){
        const old=this.messages.find(x=>x.id===id);
        if(old&&old.text!==m.text){this.messages=this.messages.map(x=>x.id===id?{...x,text:m.text}:x);this.notify();}
      }else{
        this.societyMessages.set(m.id,this.nextId);
        this.append(m.from==='player'?'player':'npc',m.text,m.at,speaker,m.source,recipients,m.from!=='player'&&m.to.includes('player')?{npcId:m.from}:undefined);
      }
      if(m.from!=='player'&&game.elapsed-m.at<8)this.bubbles.set(m.from,{text:m.text,source:m.source,until:m.at+8});
    }
    while(this.societyMessages.size>200)this.societyMessages.delete(this.societyMessages.keys().next().value!);
  }
  getSnapshot = () => this.messages;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { for (const listener of this.listeners) listener(); }
  append(kind: MessageKind, text: string, time = 0, speaker = '系统', source?: string,recipients?:string[],replyTo?:WorldReplyTarget) {
    if (!text.trim()) return;
    this.messages = retainWorldMessages([...this.messages,{id:this.nextId++,kind,speaker,text,time,...(kind==='npc'?{source:source??'template'}:{}),...(recipients?.length?{recipients}:{}),...(replyTo?{replyTo}:{})}]);
    this.notify();
  }
  reset() {
    this.societyMessages.clear();
    this.dialogueRecords.clear(); this.pending.clear(); this.dialogueErrors.clear(); this.bubbles.clear();
    this.messages=[];this.eventId=0;this.lineTexts.clear();this.speeches.clear();this.seenSpeeches.clear();this.conditions.clear();this.notify();
  }
  condition(key: string, text: string, kind: MessageKind = 'error', time = 0) {
    const previous=this.conditions.get(key);
    this.conditions.set(key,text);
    if(text&&text!==previous)this.append(kind,text,time);
  }
  capture(game: GameState) {
    this.captureSociety(game);
    const additions: {kind:MessageKind;text:string;time:number;speaker?:string;source?:string;recipients?:string[];replyTo?:WorldReplyTarget}[]=[];
    for(const event of game.events)if(event.id>this.eventId){
      additions.push({kind:event.kind,text:event.text,time:event.time});
      this.eventId=Math.max(this.eventId,event.id);
    }
    const socialSpeech=new Set<string>();
    for(const thread of game.social.threads)for(const line of thread.lines){
      socialSpeech.add(`${line.speaker}:${line.text}`);
      if(this.lineTexts.get(line.id)===line.text)continue;
      this.lineTexts.set(line.id,line.text);
      if(this.managedDialogue && line.speaker !== 'player') continue;
      const targets=socialLineTargets(thread,line);
      additions.push({kind:line.speaker==='player'?'player':'npc',speaker:line.speaker==='player'?'领主':game.npcs.find(n=>n.id===line.speaker)?.name??line.speaker,text:line.text,time:line.at,source:line.source,recipients:recipientNames(game,targets),...(line.speaker!=='player'&&targets.includes('player')?{replyTo:{npcId:line.speaker,threadId:thread.id}}:{})});
    }
    // Bound de-duplication metadata as well as visible history.
    while(this.lineTexts.size>300)this.lineTexts.delete(this.lineTexts.keys().next().value!);
    for(const npc of game.npcs){
      if(this.managedDialogue) continue;
      const signature=`${npc.speechUntil}:${npc.speech}`,previous=this.speeches.get(npc.id);
      this.speeches.set(npc.id,signature);
      const speechKey=`${npc.id}:${signature}`,seen=this.seenSpeeches.has(speechKey);
      this.seenSpeeches.add(speechKey);
      if(npc.speech&&npc.speechUntil>game.elapsed&&signature!==previous&&!seen&&!socialSpeech.has(`${npc.id}:${npc.speech}`))
        additions.push({kind:'npc',speaker:npc.name,text:npc.speech,time:game.elapsed,source:currentSpeechSource(npc)});
    }
    while(this.seenSpeeches.size>300)this.seenSpeeches.delete(this.seenSpeeches.values().next().value!);
    additions.sort((a,b)=>a.time-b.time);
    for(const item of additions)this.append(item.kind,item.text,item.time,item.speaker,item.source,item.recipients,item.replyTo);
  }
  command(command: GameCommand, game: GameState) {
    const name=game.npcs.find(n=>n.id===(command.npcId??game.selectedNpc))?.name??'伙伴';
    let text='';
    switch(command.type){
      case 'assign':text=`安排${name}：${command.action?actions[command.action]:'自主行动'}`;break;
      case 'move':if(command.target)text=`让${name}前往 (${command.target.x.toFixed(0)}, ${command.target.y.toFixed(0)})`;break;
      case 'gate-toggle':text=game.world?.gateOpen===false?'打开寨门':'关闭寨门';break;
      case 'recall':text='召回所有伙伴';break;
      case 'hunt':text=`安排${name}狩猎`;break;
      case 'praise':text=`鼓励${name}`;break;
      case 'urge':text=`催促${name}`;break;
      case 'feed':text=`给${name}分食`;break;
      case 'rescue':text=`救治${name}`;break;
      case 'priority':text=`营地优先安排：${({balanced:'均衡',wood:'木材',food:'食物'} as Record<string,string>)[command.priority??'balanced']}`;break;
      case 'weather':text=`调整天气：${({clear:'晴天',rain:'下雨',wind:'大风',storm:'雷暴'} as Record<string,string>)[command.weather??'clear']}`;break;
      case 'social-open':text=`与${name}交谈`;break;
      // Player chat and choices are copied from the actual social transcript.
    }
    if(text)this.append('player',text,game.elapsed,'领主');
  }
}
export const worldMessages = new WorldMessageStore(true);
