import { useEffect, useId, useRef, useState } from 'react';
import { defaultSettings, parseInput, parseSettings, validateSettings,
  type NumericField, type NpcSettings, type SettingsCatalog, type SettingsRepository, type SettingsSnapshot } from '../../npc-settings/src';
import './settings.css';

export interface NpcSettingsEditorProps {
  catalog: SettingsCatalog;
  repository: SettingsRepository;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  /** 由宿主解释游戏特有的生效规则；编辑器不假设游戏名称、引擎或技能 ID。 */
  note?: string;
}
const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，保存结果尚未确认，请重新载入检查。';
const display = (field: NumericField, value: number) => String(Number((value * (field.displayScale ?? 1)).toFixed(6)));

/**
 * 目录驱动的 React 表单；草稿、数据库模板、本局运行状态相互独立。
 * 非数字输入单独保存为文本并阻止提交，不会把空字符串自动当成 0。
 */
export function NpcSettingsEditor({ catalog, repository, onCancel, onDirtyChange, onBusyChange, note }: NpcSettingsEditorProps) {
  const id = useId();
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<NpcSettings | null>(null);
  const [selected, setSelected] = useState(catalog.characters[0].id);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const groups = [...new Set(catalog.fields.map(field => field.group))];
  const person = catalog.characters.find(character => character.id === selected) ?? catalog.characters[0];
  const fieldErrors: Record<string, string> = {};
  for (const character of catalog.characters) for (const field of catalog.fields) {
    const key = `${character.id}/${field.id}`;
    if (raw[key] !== undefined) {
      try { parseInput(field, raw[key]); } catch (cause) { fieldErrors[key] = message(cause); }
    }
  }
  const invalid = Object.keys(fieldErrors).length > 0;
  const dirty = !!draft && (!!snapshot && JSON.stringify(draft) !== JSON.stringify(snapshot.document) || invalid);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    const token = ++generation.current;
    setBusy(true); setError(''); setNotice('');
    void repository.load().then(value => {
      if (!mounted.current || generation.current !== token) return;
      const clean = validateSettings(catalog, value.document);
      setSnapshot({ revision: value.revision, document: clean });
      setDraft(validateSettings(catalog, clean)); setRaw({});
    }).catch(cause => { if (mounted.current && generation.current === token) setError(message(cause)); })
      .finally(() => { if (mounted.current && generation.current === token) setBusy(false); });
    return () => { generation.current++; };
  }, [repository, catalog, attempt]);

  const change = (field: NumericField, text: string) => {
    const key = `${person.id}/${field.id}`;
    setRaw(previous => ({ ...previous, [key]: text })); setNotice('');
    try {
      const value = parseInput(field, text);
      setDraft(previous => previous ? { ...previous, characters: { ...previous.characters,
        [person.id]: { ...previous.characters[person.id], [field.id]: value } } } : previous);
    } catch { /* 保留原始文本，让字段错误可见；不写入无效数字。 */ }
  };
  const save = async () => {
    if (!draft || !snapshot || invalid || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const value = await repository.save(validateSettings(catalog, draft), snapshot.revision);
      if (!mounted.current) return;
      const clean = validateSettings(catalog, value.document);
      setSnapshot({ revision: value.revision, document: clean }); setDraft(validateSettings(catalog, clean)); setRaw({});
      setNotice('已保存角色初始模板，新开局时生效；当前存档不变。');
    } catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const reset = (all: boolean) => {
    if (!draft || busy) return;
    const defaults = defaultSettings(catalog);
    setDraft(all ? defaults : { ...draft, characters: { ...draft.characters, [person.id]: defaults.characters[person.id] } });
    setRaw(previous => all ? {} : Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${person.id}/`))));
    setNotice('默认值已放入草稿，点击保存后才会生效。'); setError('');
  };
  const importFile = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (file.size > 1_000_000) throw new Error('配置文件不能超过 1 MB。');
      const value = parseSettings(catalog, await file.text());
      if (mounted.current) { setDraft(value); setRaw({}); setNotice('已导入草稿，检查后点击保存。'); }
    } catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const exportFile = () => {
    if (!draft || invalid || busy) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(validateSettings(catalog, draft), null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${catalog.gameId}-npc-settings.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const reload = () => {
    if (busy || dirty && !globalThis.confirm('重新载入会放弃当前未保存的修改，确定继续吗？')) return;
    setAttempt(value => value + 1);
  };
  return <section className="npc-settings" aria-busy={busy}>
    <p className="npc-settings-note">{note ?? '这里编辑角色初始化模板，保存不修改正在进行的游戏。'}</p>
    <div className="npc-settings-feedback">
      {error ? <div role="alert" className="npc-settings-error">{error}<button type="button" onClick={reload} disabled={busy}>重新载入配置</button></div> : null}
      {notice ? <p role="status">{notice}</p> : busy ? <p role="status">正在处理角色配置…</p> : null}
    </div>
    {draft && snapshot ? <>
      <div className="npc-settings-layout">
        <nav className="npc-settings-people" aria-label="选择要配置的角色">
          {catalog.characters.map(character => <button key={character.id} type="button" disabled={busy} aria-pressed={character.id === person.id}
            onClick={() => setSelected(character.id)}>{character.label}<span>{catalog.fields.some(field => draft.characters[character.id][field.id] !== character.defaults[field.id]) ? '自定义' : '默认'}</span></button>)}
        </nav>
        <div className="npc-settings-fields">
          <header><h3>{person.label}</h3><p>{person.description}</p><small>当前编辑初始模板 · 保存版本 {snapshot.revision}</small></header>
          {groups.map(group => <fieldset key={group} disabled={busy}><legend>{group}</legend>
            {catalog.fields.filter(field => field.group === group).map(field => {
              const key = `${person.id}/${field.id}`, fieldId = `${id}-${field.id}`, scale = field.displayScale ?? 1;
              const value = draft.characters[person.id][field.id];
              return <div className="npc-settings-field" key={field.id}>
                <div className="npc-settings-label"><label htmlFor={fieldId}>{field.label}</label><small>默认 {display(field, person.defaults[field.id])}</small></div>
                <div className="npc-settings-inputs">
                  <input type="range" aria-label={`${field.label}滑块`} min={field.min * scale} max={field.max * scale} step={field.step * scale}
                    value={display(field, value)} onChange={event => change(field, event.target.value)} />
                  <input id={fieldId} type="number" inputMode="decimal" min={field.min * scale} max={field.max * scale} step={field.step * scale}
                    value={raw[key] ?? display(field, value)} onChange={event => change(field, event.target.value)} aria-invalid={!!fieldErrors[key]}
                    aria-describedby={`${fieldId}-help${fieldErrors[key] ? ` ${fieldId}-error` : ''}`} />
                </div>
                <p id={`${fieldId}-help`}>{field.description}</p>
                {fieldErrors[key] ? <p className="npc-settings-error" id={`${fieldId}-error`}>{fieldErrors[key]}</p> : null}
              </div>;
            })}
          </fieldset>)}
        </div>
      </div>
      <div className="npc-settings-tools">
        <button type="button" disabled={busy} onClick={() => reset(false)}>恢复当前角色默认</button>
        <button type="button" disabled={busy} onClick={() => reset(true)}>恢复全部默认</button>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>导入 JSON</button>
        <button type="button" disabled={busy || invalid} onClick={exportFile}>导出当前草稿</button>
        <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''; void importFile(file);
        }} />
      </div>
    </> : null}
    <footer className="npc-settings-footer"><span>{invalid ? '有字段无效，请修正后保存。' : dirty ? '有未保存的修改' : '设置仅在新开局生效'}</span>
      <button type="button" onClick={onCancel} disabled={busy}>返回</button>
      <button type="button" className="npc-settings-save" onClick={() => void save()} disabled={busy || invalid || !dirty || !snapshot}>保存初始模板</button>
    </footer>
  </section>;
}
