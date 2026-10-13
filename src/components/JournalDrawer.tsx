import { BarChart3, ChevronRight, ScrollText } from 'lucide-react';
import type { GameState } from '../games/camp/simulation/types';
import { ClockText, Modal } from './ui';

export function JournalDrawer({ game, onObserve, onClose }: { game: GameState; onObserve: () => void; onClose: () => void }) {
  return <Modal title="林间手记" onClose={onClose} className="hud-drawer journal-drawer">
    <p className="journal-drawer-lead">记下今晚的劳作、相互照顾，还有一点小牢骚。</p>
    <div className="journal-drawer-events" aria-label="活动日志">
      {game.events.length ? game.events.slice().reverse().map(event => <article className={`journal-drawer-event ${event.kind}`} key={event.id}>
        <span className="journal-event-dot" aria-hidden="true" />
        <time><ClockText elapsed={event.time} /></time>
        <p>{event.text}</p>
      </article>) : <div className="journal-drawer-empty"><ScrollText size={30} /><p>篝火刚刚点亮。<br />我们的故事，从这里开始。</p></div>}
    </div>
    <button className="journal-observe-button" aria-label="决策观察" onClick={onObserve}><BarChart3 size={18} /><span><strong>决策观察</strong><small>看看伙伴为什么选择这份工作</small></span><ChevronRight size={17} /></button>
  </Modal>;
}
