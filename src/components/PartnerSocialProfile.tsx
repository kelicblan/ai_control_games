import { HeartHandshake, History, Leaf, Timer } from 'lucide-react';
import type { GameState, Npc } from '../games/camp/simulation/types';
import { customCampPersona, hasCustomCampTraits } from '../games/camp/npc/profiles';
import { PERSONAS } from '../games/camp/simulation/personalities';
import { ClockText } from './ui';

const promiseLabels = { pending: '待兑现', kept: '已兑现', broken: '已失约', cancelled: '已取消' };
const stanceLabels = { cooperate: '愿意合作', endure: '勉强继续', bargain: '想谈条件', evade: '行动拖延',
  rest: '自行休息', refuse: '拒绝安排', recruit: '召集伙伴表达不满', strike: '停工中' };
const concernLabels = { rest: '休息', food: '进食', fairness: '分工', safety: '安全' };
export function PartnerSocialProfile({ game, npc }: { game: GameState; npc: Npc }) {
  const person = game.social.people[npc.id];
  // 界面只展示亲历的事件与可观察立场，不把掩饰策略的私人理由当成玩家已知事实。
  const memories = [...game.social.memories.filter(memory => memory.npcId === npc.id)
    .map(memory => ({ id: `social-${memory.id}`, at: memory.at, text: memory.text })),
  ...(npc.mind?.memories ?? []).map(memory => ({ id: `mind-${memory.sequence}`, at: memory.at, text: memory.fact }))]
    .sort((a, b) => b.at - a.at).filter((memory, index, list) => list.findIndex(other => other.text === memory.text) === index).slice(0, 5);
  const promises = game.social.promises.filter(promise => promise.npcId === npc.id).slice(-4).reverse();
  const relationships = game.social.relationships.filter(relation => relation.from === npc.id);
  const persona = hasCustomCampTraits(npc) ? { ...PERSONAS[npc.id], headline: '自定义性格 · 本局快照',
    description: customCampPersona(npc), advice: '行为依据本局人格、身体和经历；修改初始模板只影响新开局。' } : PERSONAS[npc.id];
  const concern = npc.mind?.concerns.filter(item => item.status !== 'resolved').sort((a, b) => b.severity - a.severity)[0];
  const anger = npc.mind?.emotions.anger ?? 0;
  return <section className="partner-social-profile" aria-label={`${npc.name}的性格与记忆`}>
    <div className="partner-personality"><strong>{persona.headline}</strong><p>{persona.description}</p><small><Leaf size={12} />{persona.advice}</small></div>
    {npc.mind ? <div className={`partner-stance ${anger > .6 ? 'angry' : ''}`} aria-label="当前态度">
      <strong>{stanceLabels[npc.mind.intent.kind]}</strong><span>{anger > .7 ? '火气很大' : anger > .35 ? '明显烦躁' : npc.mind.emotions.resentment > .4 ? '仍有芥蒂' : '情绪尚稳'}</span>
      {concern ? <small>{concernLabels[concern.kind]}诉求{concern.status === 'granted' ? '已答应，等待实际解决' : '尚未解决'}{concern.denials > 0 ? ` · 已被拒绝 ${concern.denials} 次` : ''}</small> : null}
    </div> : null}
    <div className="partner-social-stats"><span>信任 <strong>{Math.round(npc.trust)}</strong></span><span>不满 <strong>{Math.round(person.resentment)}</strong></span><span>劳作负担 <strong>{Math.round(person.workload)}</strong></span></div>
    <details className="partner-records"><summary><History size={14} />共同经历、承诺与伙伴关系<span>{memories.length} 条近期记忆</span></summary>
      <div className="partner-promises" aria-label="对伙伴的承诺">{promises.length ? promises.map(promise => <div key={promise.id} className={`partner-promise ${promise.status}`}><Timer size={13} /><span>{promise.kind === 'meal' ? '让伙伴吃一餐' : '让伙伴休息一轮'}</span><strong>{promiseLabels[promise.status]}</strong>{promise.status === 'pending' ? <small>还剩 {Math.max(0, Math.ceil(promise.dueAt - game.elapsed))} 秒</small> : null}</div>) : <p className="social-empty">目前没有承诺。答应后的吃饭、休息需要真正完成。</p>}</div>
      <div className="partner-memories" aria-label="伙伴记忆">{memories.length ? memories.map(memory => <p key={memory.id}><time><ClockText elapsed={memory.at} /></time><span>{memory.text}</span></p>) : <p className="social-empty">还没有共同的经历。你的安排和兑现的承诺会被记住。</p>}</div>
      <div className="partner-relationships" aria-label="与其他伙伴的关系"><HeartHandshake size={13} />{relationships.map(relation => <span key={relation.to}>{game.npcs.find(other => other.id === relation.to)?.name}<strong>{Math.round(relation.affinity)}</strong></span>)}</div>
    </details>
  </section>;
}
