import type { DatabaseSync } from 'node:sqlite';
import type { Checkpoint } from './store';

export function archiveConversations(db:DatabaseSync,player:string,value:Checkpoint) {
 const scope=value.journal;if(!scope)return;
 const insert=db.prepare('INSERT INTO conversation_history(player,generation,branch,key,payload,at,kind) VALUES(?,?,?,?,?,?,?) ON CONFLICT(player,generation,branch,key) DO UPDATE SET payload=excluded.payload WHERE payload<>excluded.payload');
 const names=new Map(value.state.npcs.map(n=>[n.id as string,n.name]));
 const add=(key:string,speaker:string,text:string,at:number,source?:string,targets:readonly string[]=[])=>{
  if(!text.trim())return;
  const kind=speaker==='player'?'player':'npc';
  insert.run(player,scope.generation,scope.branch,key,JSON.stringify({key,kind,speaker:speaker==='player'?'领主':names.get(speaker)??speaker,text,time:at,source,recipients:targets.filter(id=>id!==speaker).map(id=>id==='player'?'领主':names.get(id)??id)}),at,kind);
 };
 for(const thread of value.state.social.threads)for(const line of thread.lines)add(`social:${thread.id}:${line.id}`,line.speaker,line.text,line.at,line.source);
 for(const record of value.dialogues??[])add(record.id,record.npcId,record.text,record.at,record.source,record.targetIds);
 for(const message of value.state.socialLife?.messages??[])add(`society:${message.id}`,message.from,message.text,message.at,message.source,message.to);
}

export function conversationPage(db:DatabaseSync,player:string,scope:{generation:string;branch:string},page:number,through?:number) {
 const args=[player,scope.generation,scope.branch];
 const ceiling=through??Number(db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM conversation_history WHERE player=? AND generation=? AND branch=?').get(...args)!.id);
 const stats=db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(kind='npc'),0) AS npc,COALESCE(SUM(kind='player'),0) AS player FROM conversation_history WHERE player=? AND generation=? AND branch=? AND id<=?").get(...args,ceiling)!;
 const total=Number(stats.total),pages=Math.max(1,Math.ceil(total/20)),current=Math.min(pages,Math.max(1,page));
 const items=db.prepare('SELECT payload FROM conversation_history WHERE player=? AND generation=? AND branch=? AND id<=? ORDER BY at DESC,id DESC LIMIT 20 OFFSET ?').all(...args,ceiling,(current-1)*20).map(row=>JSON.parse(String(row.payload)));
 return {items,total,npc:Number(stats.npc),player:Number(stats.player),page:current,pages,pageSize:20,through:ceiling,scope:`${scope.generation}:${scope.branch}`};
}
