import { useState } from 'react';
import { X } from 'lucide-react';
import '../styles/game-notices.css';

export interface GameNoticeData {
  id: string;
  text: string;
  closeLabel: string;
  severity?: 'warning' | 'info';
  className?: string;
  hidden?: boolean;
  action?: { label: string; run: () => void };
}

function GameNotice({ notice }: { notice: GameNoticeData }) {
  const [dismissed, setDismissed] = useState(false);
  // Remain mounted while a dialog hides the card; dismissals survive opening settings.
  // Removing a resolved error unmounts its card, so a later failure can appear again.
  if (dismissed || notice.hidden) return null;
  return <aside role={notice.severity === 'info' ? 'status' : 'alert'} className={`game-notice game-notice--${notice.severity ?? 'warning'} ${notice.className ?? ''}`}>
    <button type="button" className="game-notice-close" aria-label={notice.closeLabel} title="关闭提示" onClick={() => setDismissed(true)}><X size={18} aria-hidden="true" /></button>
    <p>{notice.text}</p>
    {notice.action ? <button type="button" className="game-notice-action" onClick={notice.action.run}>{notice.action.label}</button> : null}
  </aside>;
}

export function GameNotices({ notices }: { notices: GameNoticeData[] }) {
  return <section className="game-notices" aria-label="游戏提示" data-active-count={notices.length}>
    {notices.map(notice => <GameNotice key={notice.id} notice={notice} />)}
  </section>;
}
