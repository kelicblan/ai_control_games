import { useEffect, useRef, useSyncExternalStore } from 'react';
import { PlayerReplyChoices } from './PlayerReplyChoices';
import { worldMessages } from '../gameMessages';
import { socialDialogueId } from '../games/camp/dialogue/records';
import { Check, MessageCircle } from 'lucide-react';
import type { GameCommand, GameState, NpcId } from '../games/camp/simulation/types';
import type { SocialThread, SocialTopic } from '../games/camp/simulation/social-types';
import { getSocialChoices } from '../games/camp/simulation/social';
import { PERSONAS } from '../games/camp/simulation/personalities';
import { Modal, Portrait } from './ui';
import { PartnerSocialProfile } from './PartnerSocialProfile';
import { CollectiveStatus } from './CollectiveStatus';

const topics: { id: SocialTopic; label: string; aria: string }[] = [
  { id: 'checkin', label: '近况', aria: '聊聊近况' }, { id: 'work', label: '分工', aria: '聊聊分工' },
  { id: 'food', label: '分食', aria: '聊聊分食' }, { id: 'weather', label: '安全', aria: '聊聊安全' },
  { id: 'conflict', label: '分歧', aria: '聊聊分歧' }, { id: 'promise', label: '承诺', aria: '聊聊承诺' },
];
import { dialogueSourceName } from '../integrations/models/runtime';
import { DialogueSourceIcon } from './DialogueSourceIcon';
export function SocialDialog({ game, thread, npcId, onCommand, onTopic, onClose }: {
  game: GameState; thread: SocialThread | undefined; npcId: NpcId;
  onCommand: (command: GameCommand) => void; onTopic: (topic: SocialTopic) => void; onClose: () => void;
}) {
  useSyncExternalStore(worldMessages.subscribe, worldMessages.getSnapshot, worldMessages.getSnapshot);
  const transcript = useRef<HTMLDivElement>(null);
  const lastLineId = thread?.lines.at(-1)?.id;
  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [thread?.id, lastLineId]);
  const npc = game.npcs.find(person => person.id === npcId)!;
  const open = thread?.status === 'open' && npc.alive && ['playing', 'paused'].includes(game.status);
  const choices = thread && open ? getSocialChoices(game, thread) : [];
  const waitingForAction = thread?.status === 'resolved' && Boolean(thread.choiceId);
  return <Modal title="营地对话" onClose={onClose} className="hud-drawer social-dialog">
    <div className="social-speaker"><Portrait id={npc.id} /><div><span>{PERSONAS[npc.id].headline}</span><h3>{npc.name}</h3><p>{thread?.title ?? '听听伙伴的想法'}</p></div><MessageCircle size={24} /></div>
    {thread && thread.participants.length > 1 ? <div className="social-participants" aria-label="在场伙伴">{thread.participants.map(id => <span key={id}><Portrait id={id} />{game.npcs.find(person => person.id === id)?.name}</span>)}</div> : null}
    <nav className="social-topics" aria-label="主动交流话题">{topics.map(topic => <button key={topic.id} aria-label={topic.aria} disabled={waitingForAction || !npc.alive || !['playing', 'paused'].includes(game.status)} onClick={() => onTopic(topic.id)}>{topic.label}</button>)}</nav>
    {thread ? <>
      {!game.socialLife?<div ref={transcript} className="social-transcript" role="log" aria-label="对话记录" aria-live="polite">{thread.lines.map(line => {
        const result = worldMessages.dialogue(socialDialogueId(thread.id, line.id))
          ?? (line.source !== 'template' && line.source !== 'player' ? line : undefined);
        const source = line.speaker === 'player' ? 'player' : result?.source;
        const error = worldMessages.dialogueError(socialDialogueId(thread.id, line.id));
        return <article key={line.id} className={`social-line ${line.speaker === 'player' ? 'player' : 'companion'}`}>
          <div><strong>{line.speaker === 'player' ? '你' : game.npcs.find(person => person.id === line.speaker)?.name}</strong><small data-dialogue-source={source}>{source ? dialogueSourceName(source) : error ? '回复失败' : '等待模型回复'}</small></div><p>{result ? <DialogueSourceIcon source={result.source} /> : null}{line.speaker === 'player' ? line.text : result?.text ?? error ?? '正在生成回复…'}</p>
        </article>;
      })}</div>:null}
      {thread.status !== 'open' ? <div className="social-resolution" role="status"><Check size={17} /><p>{thread.resolution || (thread.status === 'expired' ? '这次请求已经到期，伙伴会照顾自己的需要。' : '安排已经记下。')}</p></div> : <section className="social-choices" aria-label="回应与安排"><h4>一起商量一个安排</h4>{choices.map(choice => <button className="social-choice" key={choice.id} disabled={Boolean(choice.disabledReason)} onClick={() => onCommand({ type: 'social-reply', threadId: thread.id, choiceId: choice.id })}><strong>{choice.label}</strong><small>{choice.description}</small>{choice.disabledReason ? <span>{choice.disabledReason}</span> : null}</button>)}</section>}
    </> : <p className="social-empty">选一个话题，和伙伴开始聊聊。</p>}
    {waitingForAction ? <p className="social-cooldown">这次安排已经记下。回营地行动一会儿，再聊新的话题。</p> : null}
    {npc.alive&&['playing','paused'].includes(game.status)&&(!thread||thread.status!=='open')&&!game.socialLife?.messages.some(m=>m.from===npc.id&&m.replies.player==='pending')?<button type="button" className="social-choice-refresh" onClick={()=>onTopic('checkin')}>继续聊聊</button>:null}
    <PlayerReplyChoices game={game} npcId={npc.id} onCommand={onCommand}/>
    <PartnerSocialProfile game={game} npc={npc} />
    <CollectiveStatus game={game} onCommand={onCommand}/>
  </Modal>;
}
