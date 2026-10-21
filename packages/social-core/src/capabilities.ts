import { record } from '../../action-runtime/src/json';
import { validId } from '../../action-runtime/src/types';
export interface RegisteredCapability {
  id: string; version: string; action: string; requiredConsent: 'actor-and-parties'; successEvent: string;
  parametersValid(value: unknown): boolean;
}
const wait: RegisteredCapability = Object.freeze({ id: 'WAIT', version: '1', action: 'WAIT', requiredConsent: 'actor-and-parties', successEvent: 'execution.completed',
  parametersValid(value: unknown) { return record(value) && Object.keys(value).length === 1 && typeof value.seconds === 'number' && Number.isFinite(value.seconds) && value.seconds >= .1 && value.seconds <= 60; } });
/** No dynamic function names, scripts or game-state write methods in this catalog. */
const rest: RegisteredCapability = { ...wait, id: 'REST', action: 'REST', successEvent: 'rest.completed' };
const transfer: RegisteredCapability = { id: 'TRANSFER', version: '1', action: 'TRANSFER', requiredConsent: 'actor-and-parties', successEvent: 'item.handed_over',
  parametersValid(value) { return record(value) && Object.keys(value).every(k => ['itemId', 'rights'].includes(k)) && validId(value.itemId) && (value.rights === undefined || value.rights === 'use'||value.rights==='return'); } };
const craft: RegisteredCapability = { id: 'CRAFT', version: '1', action: 'CRAFT', requiredConsent: 'actor-and-parties', successEvent: 'item.crafted',
  parametersValid(value) { return record(value) && Object.keys(value).every(k => ['recipeId', 'recipientId', 'agreementId'].includes(k)) && validId(value.recipeId) && validId(value.recipientId) && (value.agreementId === null || value.agreementId === undefined || validId(value.agreementId)); } };
const empty = (value: unknown) => record(value) && Object.keys(value).length === 0;
const position = (value: unknown) => record(value) && Object.keys(value).length === 2 && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y);
const tasks: RegisteredCapability[] = ['RESCUE', 'HEAL', 'REPAIR_FENCE', 'ATTACK', 'DEPOSIT', 'PICK_UP', 'GATHER_WOOD', 'GATHER_STONE', 'GATHER_ROPE'].map(id => ({ id, version: '1', action: id, requiredConsent: 'actor-and-parties', successEvent: 'execution.completed', parametersValid: empty }));
tasks.push({ id: 'ACCEPT_REQUEST', version: '1', action: 'ACCEPT_REQUEST', requiredConsent: 'actor-and-parties', successEvent: 'institution.changed', parametersValid: v => record(v) && Object.keys(v).length === 1 && record(v.institution) });
tasks.push(...['FOLLOW','ESCORT','SOCIAL_VISIT'].map<RegisteredCapability>(id=>({...rest,id,action:id,parametersValid:v=>rest.parametersValid(v)&&Number((v as {seconds:number}).seconds)<=30})));
tasks.push(...['GUARD', 'REPOSITION', 'RETREAT', 'GOTO_RENDEZVOUS'].map<RegisteredCapability>(id => ({ id, version: '1', action: id, requiredConsent: 'actor-and-parties', successEvent: 'execution.completed', parametersValid: position })));
export function resolveCapability(id: string, version: string): RegisteredCapability | undefined { return [wait, rest, transfer, craft, ...tasks].find(c => c.id === id && c.version === version); }
