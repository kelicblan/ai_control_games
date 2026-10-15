import { useCallback, useRef } from 'react';
import { NpcSettingsEditor } from '../../../../packages/npc-settings-react/src/Editor';
import { Modal } from '../../../components/ui';
import { CAMP_SETTINGS_CATALOG } from './catalog';
import { campSettingsRepository } from './repository';
import './settings-dialog.css';
import { worldMessages } from '../../../gameMessages';

/** 营地只负责装配通用编辑器。关闭窗口、Esc 和返回按钮共用未保存草稿保护。 */
export function NpcSettingsDialog({ onClose }: { onClose: () => void }) {
  const dirty = useRef(false), busy = useRef(true);
  const setDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
  const setBusy = useCallback((value: boolean) => { busy.current = value; }, []);
  const feedback=useCallback((message:string,severity:'error'|'info')=>{worldMessages.append(severity,message);},[]);
  const close = useCallback(() => {
    if (busy.current) return;
    if (dirty.current && !globalThis.confirm('有未保存的角色修改，确定放弃并返回吗？')) return;
    onClose();
  }, [onClose]);
  return <Modal title="角色初始设置" className="npc-settings-modal" onClose={close}>
    <NpcSettingsEditor catalog={CAMP_SETTINGS_CATALOG} repository={campSettingsRepository}
      onCancel={close} onDirtyChange={setDirty} onBusyChange={setBusy} onFeedback={feedback}
      note="逐角色编辑性格、身体与技能初始值。保存到此浏览器，新开局（含重开）生效；继续旧存档不变。分歧时刻场景会额外增加 22 饥饿、减少 24 信任。" />
  </Modal>;
}
