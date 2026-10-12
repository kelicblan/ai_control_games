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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, a[href], [tabindex="0"]') ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
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
  }, [onClose]);
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
