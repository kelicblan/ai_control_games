import type { ModelDescriptor } from './manager';
/** Cognition follows the backend actually speaking, including local fallback. */
export function cognitionModelId(activeId:string|undefined,models:ModelDescriptor[]) {
  if(!activeId||activeId==='minimind3')return 'minimind3';
  const model=models.find(m=>m.id===activeId);
  return model?.backend==='native'?`native:${activeId}`:model?.backend==='remote'?activeId:'minimind3';
}
export const ownsCognitionBinding=(visible:boolean,focused:boolean)=>visible&&focused;
