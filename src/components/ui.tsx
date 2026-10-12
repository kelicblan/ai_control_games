import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Axe, Apple, Flame, HeartHandshake, House, Compass, BedDouble, Utensils, X } from 'lucide-react';
import type { ActionId, NpcId } from '../game/types';

export const ACTION_LABELS: Record<ActionId, string> = {
  wood: '收集木材', food: '寻找食物', fire: '照看篝火', eat: '吃点东西',
  rest: '休息', help: '帮助伙伴', camp: '返回营地', explore: '探索林间',
};
export const EMOTION_LABELS = { calm: '平静', happy: '愉快', worried: '担忧', annoyed: '不满', caring: '关切' };
const actionIcons = { wood: Axe, food: Apple, fire: Flame, eat: Utensils, rest: BedDouble, help: HeartHandshake, camp: House, explore: Compass };
export function ActionIcon({ action, size = 20 }: { action: ActionId; size?: number }) {
  const Icon = actionIcons[action];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
export function Portrait({ id, className = '' }: { id: NpcId; className?: string }) {
  if (id === 'linlan' || id === 'aye') return <div className={`portrait portrait-${id} portrait-vector ${className}`} aria-hidden="true">
    <svg viewBox="0 0 90 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="90" height="100" fill={id === 'linlan' ? '#6b7863' : '#817550'} />
      <path d="M5 100Q9 71 45 70Q81 71 85 100" fill={id === 'linlan' ? '#9b645a' : '#427d77'} />
      <path d="M35 65v16l10 8 10-8V65" fill="#d5a17a" />
      <ellipse cx="45" cy="44" rx="25" ry="31" fill="#e3b18b" />
      {id === 'linlan' ? <><path d="M18 47V30Q17 7 43 7Q73 5 72 32L70 65 61 66V36Q41 30 29 22L28 67 18 63Z" fill="#352e2a" /><path d="M26 47h14m10 0h14m-24 0h10" fill="none" stroke="#4b493d" strokeWidth="2" /><rect x="25" y="42" width="16" height="12" rx="5" fill="none" stroke="#4b493d" strokeWidth="2" /><rect x="49" y="42" width="16" height="12" rx="5" fill="none" stroke="#4b493d" strokeWidth="2" /><path d="M26 81l14 19h10l14-19" stroke="#cbd0b2" strokeWidth="6" fill="none" /></> : <><path d="M20 39l-4-12 8 1-2-11 11 2 5-12 9 8 13-5-1 11 12 4-7 14-3-11-11 4-11-7-10 10Z" fill="#3d3127" /><path d="M20 23Q21 5 46 6Q64 6 72 25L29 29Z" fill="#be9850" /><path d="M28 27Q53 20 77 25L80 31 28 34Z" fill="#d7b06a" /><path d="M29 82l8 18h15l9-20" stroke="#d4b36d" strokeWidth="7" fill="none" /></>}
      <ellipse cx="34" cy="48" rx="2.4" ry="3.3" fill="#342c24" /><ellipse cx="56" cy="48" rx="2.4" ry="3.3" fill="#342c24" />
      <path d="M44 50l-2 8h5" stroke="#c18b66" strokeWidth="1.6" fill="none" /><path d="M37 64q8 6 16-1" stroke="#8d5143" strokeWidth="1.9" strokeLinecap="round" fill="none" />
      <path d="M18 88l9 12M70 86l-8 14" stroke="#483f32" strokeWidth="5" />
    </svg>
  </div>;
  return <div className={`portrait portrait-${id} ${className}`} aria-hidden="true" />;
}
export function Meter({ value, tone = 'green', label, compact = false }: { value: number; tone?: string; label: string; compact?: boolean }) {
  const rounded = Math.round(Math.max(0, Math.min(100, value)));
  return <div className={`meter-row ${compact ? 'compact' : ''}`}>
    <span className="meter-label">{label}</span>
    <span className={`meter-track ${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rounded}>
      <span style={{ width: `${rounded}%` }} />
    </span>
    <span className="meter-value">{rounded}<small>%</small></span>
  </div>;
}
export function IconButton({ label, onClick, children, active = false, disabled = false, className = '' }: {
  label: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean; className?: string;
}) {
  return <button className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>;
}
export function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose?: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]') ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCloseRef.current) onCloseRef.current();
      if (e.key === 'Tab') {
        const elements = focusables();
        const first = elements[0]; const last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop"><div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={id}>
    <div className="modal-header"><h2 id={id}>{title}</h2>{onClose ? <IconButton label="关闭窗口" onClick={onClose}><X size={20} /></IconButton> : null}</div>
    {children}
  </div></div>;
}
export function ClockText({ elapsed }: { elapsed: number }) {
  const minutes = (14 * 60 + Math.floor(elapsed / 240 * 16 * 60)) % (24 * 60);
  return <>{String(Math.floor(minutes / 60)).padStart(2, '0')}:{String(minutes % 60).padStart(2, '0')}</>;
}
export const cssVars = (values: Record<string, string | number>) => values as CSSProperties;
