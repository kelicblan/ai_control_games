import type { GameCommand, GameState } from '../games/camp/simulation/types';
const stages={forming:'正在酝酿',recruiting:'寻找同伴',negotiating:'要求交涉',striking:'停工中',easing:'等待实际兑现',ended:'已结束'};
const concerns={rest:'需要休息',food:'需要口粮',fairness:'要求公平分工',safety:'需要安全保障'};
export function CollectiveStatus({game,onCommand}:{game:GameState;onCommand:(c:GameCommand)=>void}) {
  const groups=game.agency?.groups.filter(g=>g.stage!=='ended')??[];
  if(!groups.length)return null;
  return <section className="npc-collectives" aria-label="共同诉求"><h4>共同诉求</h4>{!game.agency?.enabled?<p>社会自主行为已关闭，原有诉求仍保留。</p>:null}{groups.map(g=><article key={g.id}><strong>{concerns[g.concern]} · {stages[g.stage]}</strong><p>{g.members.map(id=>game.npcs.find(n=>n.id===id)?.name).join('、')}</p>
    {g.promise?<small>已实际兑现 {g.promise.fulfilled.length}/{g.members.length} 人 · 剩余 {Math.max(0,Math.ceil(g.promise.dueAt-game.elapsed))} 秒</small>:null}
    <div>{(['listen','rest','food','fairness','refuse']as const).map(choice=><button type="button" key={choice} disabled={!game.agency?.enabled||Boolean(g.promise&&choice!=='listen'&&choice!=='refuse')} onClick={()=>onCommand({type:'collective-reply',groupId:g.id,choiceId:choice})}>{({listen:'听取诉求',rest:'安排休息',food:'安排进食',fairness:'减少这轮劳动',refuse:'拒绝调整'})[choice]}</button>)}</div>
  </article>)}</section>;
}
