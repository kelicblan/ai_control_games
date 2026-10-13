import { ArrowRight, Flame, HeartHandshake, RotateCcw, Sunrise, Trees, Users } from 'lucide-react';
import type { GameState } from '../games/camp/simulation/types';
import { Modal, Portrait } from './ui';
export function OutcomeDialog({ game, onRestart, onNew, onInspect, onClose }: { game: GameState; onRestart: () => void; onNew: () => void; onInspect: () => void; onClose: () => void }) {
  const won = game.status === 'won';
  return <Modal title={won ? '天亮了，我们都在。' : '这一晚，留下了遗憾。'} onClose={onClose} className={`outcome-modal ${won ? 'victory' : ''}`}>
    <div className="outcome-symbol">{won ? <Sunrise size={64} /> : <Flame size={56} />}</div><p className="outcome-story">{game.resultReason || (won ? '林间的第一缕光，照在还温热的篝火上。' : '重新安排工作，下一次会更有默契。')}</p>
    <div className="outcome-score"><strong>{Math.round(game.score)}</strong><span>本次营地评分</span></div>
    <div className="outcome-crew">{game.npcs.map(npc => <div key={npc.id} className={!npc.alive ? 'fallen' : ''}><Portrait id={npc.id} /><strong>{npc.name}</strong><span>{npc.alive ? '平安' : '倒下'} · 完成 {npc.completedTasks} 项任务</span></div>)}</div>
    <div className="outcome-stats"><div><Trees /><strong>{game.stats.gatheredWood}</strong><span>收集木材</span></div><div><Flame /><strong>{Math.round(game.fire)}%</strong><span>剩余火势</span></div><div><HeartHandshake /><strong>{game.stats.helps}</strong><span>同伴互助</span></div><div><Users /><strong>{game.stats.modelDecisions + game.stats.ruleDecisions + game.stats.fallbackDecisions}</strong><span>实际决策</span></div></div>
    <button className="primary-button" onClick={onNew}>再去看看另一片森林 <ArrowRight size={18} /></button><div className="outcome-actions"><button className="secondary-button" onClick={onRestart}><RotateCcw size={15} />同一种子再试一次</button><button className="text-button" onClick={onInspect}>查看这次的决策记录</button></div>
  </Modal>;
}
