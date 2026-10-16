import { CodeXml, Cpu, Star, CircleHelp } from 'lucide-react';
import { dialogueSourceName } from '../integrations/models/runtime';
export { currentSpeechSource } from '../games/camp/dialogue/source';
import '../styles/dialogue-source.css';

export function DialogueSourceIcon({ source = 'template' }: { source?: string }) {
  if (source === 'player') return null;
  if (source === 'safety') return <span className="dialogue-source-icon source-code" title="安全兜底" role="img" aria-label="安全兜底"><CodeXml size={13}/></span>;
  const preferred = /^(native|remote):/.test(source);
  const kind = source === 'template' ? 'code' : source === 'minimind3' ? 'minimind3' : preferred ? 'preferred' : 'unknown';
  const label = kind === 'code' ? '代码兜底' : kind === 'minimind3' ? 'MiniMind3'
    : kind === 'preferred' ? `优先模型：${dialogueSourceName(source)}` : '历史模型缓存：来源未记录';
  const Icon = kind === 'code' ? CodeXml : kind === 'minimind3' ? Cpu : kind === 'preferred' ? Star : CircleHelp;
  return <span className={`dialogue-source-icon source-${kind}`} data-dialogue-kind={kind} title={label} role="img" aria-label={label}>
    <Icon size={13} aria-hidden="true" />
  </span>;
}
