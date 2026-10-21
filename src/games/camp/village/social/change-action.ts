import { ensure } from '../../../../../packages/action-runtime/src/json';
import type { ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { VillageState } from '../domain/types';
import { requestPlanChange } from './adapter';
export const CHANGE_CAPABILITY:ActionCapability<VillageState>={id:'REQUEST_CHANGE',validate(state,command){const id=command.parameters.agreementId;ensure(typeof id==='string'&&Object.keys(command.parameters).length===1&&state.social.agreements[id]?.parties.includes(command.actorId)&&!['fulfilled','cancelled','breached'].includes(state.social.agreements[id].status),'Change request is outside party authority');return{duration:.1,cost:{}};},complete(state,e){requestPlanChange(state,e.command.actorId,String(e.command.parameters.agreementId));}};
