// Browser integration harness: production dialogue component and real WorldClient.
import {useEffect,useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import {WorldClient} from '../src/integrations/world/client';
import type {WorldSnapshot} from '../src/integrations/world/types';
import type {GameCommand} from '../src/games/camp/simulation/types';
import {SocialDialog} from '../src/components/SocialDialog';
import {WorldChannel} from '../src/components/WorldChannel';
import {worldMessages,type WorldReplyTarget} from '../src/gameMessages';
import '../src/styles/game.css';import '../src/styles/social.css';
function Harness(){
 const [snapshot,setSnapshot]=useState<WorldSnapshot|null>(null),[error,setError]=useState('');const client=useRef<WorldClient|null>(null);
 const [target,setTarget]=useState<WorldReplyTarget|null>(()=>new URLSearchParams(location.search).has('channel')?null:{npcId:'aye'});
 useEffect(()=>{worldMessages.reset();const c=new WorldClient(s=>{if(s.state){worldMessages.captureDialogues(s.dialogues??[],s.state);worldMessages.capture(s.state);}setSnapshot(s);},setError);client.current=c;const timer=setInterval(()=>void c.poll(),250);return()=>{clearInterval(timer);c.dispose();};},[]);
 const send=(command:GameCommand)=>{
  if(!snapshot)return;
  const action=command.type==='social-refresh'?{type:'social-refresh' as const,setId:command.setId!,scope:snapshot.dialogueScope!}:command.type==='social-choice'?{type:'social-choice' as const,setId:command.setId!,choiceId:command.choiceId!,scope:snapshot.dialogueScope!}:{type:'command' as const,command};
  void client.current!.mutate(action).catch(e=>setError(String(e)));
 };
 return <><WorldChannel onReply={setTarget}/>{error?<p role="alert">{error}</p>:null}{snapshot?.state?(target?<SocialDialog game={snapshot.state} thread={snapshot.state.social.threads.find(t=>t.id===target.threadId)} npcId={target.npcId} onCommand={send} onTopic={()=>send({type:'social-open',npcId:target.npcId,topic:'checkin'})} onClose={()=>setTarget(null)}/>:null):<p>正在载入对话…</p>}</>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
