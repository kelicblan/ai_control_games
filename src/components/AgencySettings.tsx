import { useState } from 'react';
import type { GameState } from '../games/camp/simulation/types';
import type { WorldAction } from '../integrations/world/types';
import { modelName } from '../integrations/models/runtime';
export type AgencySettingsAction=Extract<WorldAction,{type:'agency-settings'}>;
export function AgencySettings({game,onSave}:{game:GameState;onSave:(a:AgencySettingsAction)=>Promise<unknown>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const a=game.agency;
  const save=async(change:Partial<AgencySettingsAction>)=>{setBusy(true);setError('');try{await onSave({type:'agency-settings',enabled:a?.enabled??true,cognition:true,modelId:a?.modelId??'minimind3',...change});}catch(e){setError(e instanceof Error?e.message:'设置未保存');}finally{setBusy(false);}};
  return <section className="npc-agency-settings" aria-label="NPC 记忆与自主行为"><h3>NPC 记忆与自主行为</h3>
    <p>每位伙伴会记住亲历与交流，结合性格形成诉求。大模型理解处境，行动仍由世界模拟执行。</p>
    <label><input type="checkbox" checked={a?.enabled??true} disabled={busy} onChange={e=>void save({enabled:e.target.checked})}/>启用社会自主行为</label>
    <p role="status">认知已默认开启 · 当前模型：{modelName((a?.modelId??'minimind3').replace(/^native:/,''))}</p>
    <p className="npc-memory-note">自动跟随当前使用的对话模型，无需单独选择；未选择优先模型或使用内置兜底时，认知也使用 MiniMind3。本地模型无需 API 配置。认知失败时继续心智策略。远程模型仅供测试。</p>
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
