import { HeartHandshake, History, Leaf, Timer } from 'lucide-react';
import type { GameState, Npc } from '../game/types';
import { PERSONAS } from '../game/personalities';
import { ClockText } from './ui';

const promiseLabels = { pending: '待兑现', kept: '已兑现', broken: '已失约', cancelled: '已取消' };
export function PartnerSocialProfile({ game, npc }: { game: GameState; npc: Npc }) {
  const person = game.social.people[npc.id];
  const memories = game.social.memories.filter(memory => memory.npcId === npc.id).slice(-5).reverse();
  const promises = game.social.promises.filter(promise => promise.npcId === npc.id).slice(-4).reverse();
  const relationships = game.social.relationships.filter(relation => relation.from === npc.id);
  const persona = PERSONAS[npc.id];
  return <section className="partner-social-profile" aria-label={`${npc.name}的性格与记忆`}>
    <div className="partner-personality"><strong>{persona.headline}</strong><p>{persona.description}</p><small><Leaf size={12} />{persona.advice}</small></div>
    <div className="partner-social-stats"><span>信任 <strong>{Math.round(npc.trust)}</strong></span><span>不满 <strong>{Math.round(person.resentment)}</strong></span><span>劳作负担 <strong>{Math.round(person.workload)}</strong></span></div>
    <details className="partner-records"><summary><History size={14} />共同经历、承诺与伙伴关系<span>{memories.length} 条近期记忆</span></summary>
      <div className="partner-promises" aria-label="对伙伴的承诺">{promises.length ? promises.map(promise => <div key={promise.id} className={`partner-promise ${promise.status}`}><Timer size={13} /><span>{promise.kind === 'meal' ? '让伙伴吃一餐' : '让伙伴休息一轮'}</span><strong>{promiseLabels[promise.status]}</strong>{promise.status === 'pending' ? <small>还剩 {Math.max(0, Math.ceil(promise.dueAt - game.elapsed))} 秒</small> : null}</div>) : <p className="social-empty">目前没有承诺。答应后的吃饭、休息需要真正完成。</p>}</div>
      <div className="partner-memories" aria-label="伙伴记忆">{memories.length ? memories.map(memory => <p key={memory.id}><time><ClockText elapsed={memory.at} /></time><span>{memory.text}</span></p>) : <p className="social-empty">还没有共同的经历。你的安排和兑现的承诺会被记住。</p>}</div>
      <div className="partner-relationships" aria-label="与其他伙伴的关系"><HeartHandshake size={13} />{relationships.map(relation => <span key={relation.to}>{game.npcs.find(other => other.id === relation.to)?.name}<strong>{Math.round(relation.affinity)}</strong></span>)}</div>
    </details>
  </section>;
}
