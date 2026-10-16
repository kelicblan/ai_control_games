import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Axe, Apple, Flame, HeartHandshake, House, Compass, BedDouble, Utensils, X } from 'lucide-react';
import type { ActionId, NpcId } from '../games/camp/simulation/types';
import { getCampClock } from '../games/camp/simulation/clock';

export const ACTION_LABELS: Record<ActionId, string> = {
  wood: '收集木材', food: '寻找食物', fire: '照看篝火', eat: '吃点东西',
  rest: '回屋休息', help: '照顾同伴', camp: '返回村寨', explore: '探索荒野',
};
export const EMOTION_LABELS = { calm: '平静', happy: '愉快', worried: '担忧', annoyed: '不满', caring: '关切' };
const actionIcons = { wood: Axe, food: Apple, fire: Flame, eat: Utensils, rest: BedDouble, help: HeartHandshake, camp: House, explore: Compass };
export function ActionIcon({ action, size = 20 }: { action: ActionId; size?: number }) {
  const Icon = actionIcons[action];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
export function Portrait({ id, className = '' }: { id: NpcId; className?: string }) {
  if (id === 'tiesheng' || id === 'aling' || id === 'xiaoman' || id === 'shenyan') {
    const palette = {
      tiesheng: { background: '#415463', coat: '#526d86', skin: '#bc8a67', hair: '#252725', scarf: '#b78b60' },
      aling: { background: '#70565e', coat: '#af727e', skin: '#e9b190', hair: '#40302d', scarf: '#e5c6a0' },
      xiaoman: { background: '#6c704d', coat: '#b49743', skin: '#e4ad7c', hair: '#493020', scarf: '#8cba98' },
      shenyan: { background: '#56566f', coat: '#77628e', skin: '#dbb696', hair: '#292c38', scarf: '#a9c4cd' },
    }[id];
    return <div className={`portrait portrait-${id} portrait-vector ${className}`} aria-hidden="true">
      <svg viewBox="0 0 90 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="90" height="100" fill={palette.background} />
        <path d="M4 100Q8 72 45 72Q82 72 86 100" fill={palette.coat} />
        <path d="M35 64v16l10 8 10-8V64" fill={palette.skin} />
        {id === 'aling' && <path d="M21 32Q14 54 20 78L29 81 31 42M67 31Q76 55 69 79L60 81 60 42" stroke={palette.hair} strokeWidth="9" fill="none" />}
        <ellipse cx="45" cy="44" rx={id === 'tiesheng' ? 27 : id === 'xiaoman' ? 23 : 25} ry={id === 'xiaoman' ? 28 : 31} fill={palette.skin} />
        {id === 'tiesheng' ? <>
          <path d="M18 36V22Q21 6 45 7Q68 7 72 26L70 38 60 25 31 25 23 39Z" fill={palette.hair} />
          <path d="M20 27h49" stroke={palette.scarf} strokeWidth="6" />
          <path d="M23 60Q45 81 67 59L62 72Q45 85 28 72Z" fill={palette.hair} />
          <path d="M62 51l4 8" stroke="#915f48" strokeWidth="2" />
        </> : id === 'aling' ? <>
          <path d="M19 42V28Q20 7 44 7Q69 6 72 31L69 45 62 27Q43 37 29 23L25 45Z" fill={palette.hair} />
          <path d="M16 72l13 3m32 0l13-3" stroke={palette.scarf} strokeWidth="5" />
          <path d="M28 39q6-4 12-1m11 0q6-3 12 1" stroke={palette.hair} strokeWidth="2" fill="none" />
          <ellipse cx="29" cy="58" rx="5" ry="2" fill="#d6887d" /><ellipse cx="61" cy="58" rx="5" ry="2" fill="#d6887d" />
        </> : id === 'xiaoman' ? <>
          <path d="M20 39L18 24 29 26 29 15 40 19 49 5 53 20 69 18 65 30 72 34 65 42 57 30 46 35 35 27 26 42Z" fill={palette.hair} />
          <path d="M29 40l12 2m10-1l11-4" stroke={palette.hair} strokeWidth="2.5" />
          <path d="M35 63q11 11 23-3" fill="#fff0d3" stroke="#8d5143" strokeWidth="1.5" />
        </> : <>
          <ellipse cx="45" cy="10" rx="12" ry="9" fill={palette.hair} />
          <path d="M18 40V26Q22 8 45 9Q70 8 72 30L69 43 62 27 29 22 24 44Z" fill={palette.hair} />
          <path d="M33 11h24" stroke={palette.scarf} strokeWidth="4" />
          <rect x="25" y="41" width="17" height="13" rx="3" fill="none" stroke="#424553" strokeWidth="2" />
          <rect x="48" y="41" width="17" height="13" rx="3" fill="none" stroke="#424553" strokeWidth="2" />
          <path d="M42 46h6m-12 18h18" stroke="#424553" strokeWidth="2" />
        </>}
        <ellipse cx="34" cy="48" rx="2.3" ry="3" fill="#302b27" /><ellipse cx="56" cy="48" rx="2.3" ry="3" fill="#302b27" />
        <path d="M44 50l-2 8h5" stroke="#ae795d" strokeWidth="1.6" fill="none" />
        {(id === 'tiesheng' || id === 'aling') && <path d={id === 'aling' ? 'M37 64q8 7 16 0' : 'M38 64h14'} stroke="#8d5143" strokeWidth="2" fill="none" strokeLinecap="round" />}
        <path d="M28 80l11 20h12l12-20" stroke={palette.scarf} strokeWidth="7" fill="none" />
        <path d="M19 87l8 13m44-13l-8 13" stroke="#483f32" strokeWidth="5" />
      </svg>
    </div>;
  }
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
  const { minutes } = getCampClock(elapsed);
  return <>{String(Math.floor(minutes / 60)).padStart(2, '0')}:{String(minutes % 60).padStart(2, '0')}</>;
}
export const cssVars = (values: Record<string, string | number>) => values as CSSProperties;
