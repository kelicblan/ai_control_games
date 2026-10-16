import { useEffect, useRef, useState } from 'react';
import { type RemoteConfig } from '../integrations/models/remote';
import { modelManager, remoteModels, syncModelCatalog } from '../integrations/models/runtime';
import { worldMessages } from '../gameMessages';

const newConfig = (): RemoteConfig => ({ id: `remote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, name: '', baseUrl: '', model: '' });
export function RemoteModelSettings() {
  const [configs, setConfigs] = useState(() => remoteModels.list());
  const [draft, setDraft] = useState<RemoteConfig | null>(null);
  const [key, setKey] = useState(''); const [clearKey, setClearKey] = useState(false);
  const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [testing, setTesting] = useState(false);
  useEffect(()=>{worldMessages.condition('remote-settings',error);},[error]);
  useEffect(()=>{worldMessages.condition('remote-settings-notice',notice,'info');},[notice]);
  const [saving, setSaving] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => remoteModels.subscribe(() => setConfigs(remoteModels.list())), []);
  useEffect(() => { void remoteModels.refresh().catch(err => setError(err instanceof Error ? err.message : '读取配置失败')); }, []);
  const edit = (config: RemoteConfig) => { request.current?.abort(); setTesting(false); setDraft(config); setKey(''); setClearKey(false); setNotice(''); setError(''); };
  const refresh = () => { setConfigs(remoteModels.list()); syncModelCatalog(); };
  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await remoteModels.save(draft, clearKey ? '' : key || undefined); refresh(); setDraft(null); setKey(''); setNotice('配置已保存到当前玩家数据库，刷新后继续有效。'); setError('');
      if (modelManager.snapshot().selectedId === draft.id) void modelManager.select(draft.id);
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    try {
      await remoteModels.remove(id); refresh();
      if (modelManager.snapshot().selectedId === id) await modelManager.select('minimind3');
      if (draft?.id === id) { setDraft(null); setKey(''); }
      setError(''); setNotice('配置已删除。');
    } catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
  };
  const test = async () => {
    if (!draft || testing) return;
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setTesting(true); setError(''); setNotice('');
    try {
      await remoteModels.test(draft, clearKey ? '' : key || undefined, controller.signal);
      if (!controller.signal.aborted) setNotice(`连接成功：${draft.name || draft.model} 已返回测试文本，可以选择使用。`);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '连接失败'); }
    finally { if (request.current === controller) { request.current = null; setTesting(false); } }
  };
  return <section className="remote-model-settings" aria-label="远程模型配置">
    <div className="remote-heading"><h4>远程模型</h4><button type="button" disabled={saving} onClick={() => edit(newConfig())}>添加远程模型</button></div>
    <p className="model-settings-note">支持 OpenAI 兼容接口。配置按当前玩家保存到数据库，API Key 加密保存，刷新后继续有效。</p>
    {configs.map(config => <div className="remote-config-row" key={config.id}>
      <span><strong>{config.name}</strong><small>{config.model}{config.requiresKey && !config.hasKey ? ' · 待填写密钥' : ''}</small></span>
      <button type="button" disabled={saving} aria-label={`编辑 ${config.name}`} onClick={() => edit(config)}>编辑</button>
      <button type="button" disabled={saving} aria-label={`删除 ${config.name}`} onClick={() => void remove(config.id)}>删除</button>
    </div>)}
    {draft ? <form className="remote-model-form" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={saving || testing} className="remote-model-fields">
      <label>配置名称<input required maxLength={60} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="例如：远程对话模型" /></label>
      <label>接口地址<input required type="url" maxLength={2000} value={draft.baseUrl} onChange={e => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://服务商域名/v1" /></label>
      {/^https:\/\/open\.bigmodel\.cn\/api\/v1\/?$/.test(draft.baseUrl) ? <p className="model-settings-note">智谱官方接口使用 /api/paas/v4，调用时会自动修正；Coding Plan 请填写 /api/coding/paas/v4。</p> : null}
      <label>模型 ID<input required maxLength={120} value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} placeholder="服务商提供的模型 ID" /></label>
      <label>API Key<input type="password" autoComplete="off" maxLength={4096} value={key} onChange={e => setKey(e.target.value)} placeholder={draft.hasKey ? '已保存到数据库，留空保留' : '无鉴权接口可留空'} /></label>
      {draft.requiresKey ? <label className="remote-clear-key"><input type="checkbox" checked={clearKey} onChange={e => setClearKey(e.target.checked)} />清除密钥，改用无鉴权接口</label> : null}
      <p className="model-settings-note">连接测试会发送一条简短请求；游戏台词也会发送到此服务。需要运行游戏服务以转发请求。</p>
      </fieldset><div className="remote-form-actions"><button type="submit" disabled={testing || saving}>{saving ? '保存中…' : '保存配置'}</button><button type="button" disabled={testing || saving} onClick={() => void test()}>{testing ? '测试中…' : '测试连接'}</button><button type="button" disabled={saving} onClick={() => { request.current?.abort(); setTesting(false); setDraft(null); setKey(''); }}>取消</button></div>
      {testing ? <p className="remote-result" role="status">正在测试连接，最多等待 20 秒…</p> : error ? <p className="remote-result is-error" role="alert">连接或配置失败：{error}</p> : notice ? <p className="remote-result" role="status">{notice}</p> : null}
    </form> : null}
    {!draft && (error || notice) ? <p className={`remote-result ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</p> : null}
  </section>;
}
