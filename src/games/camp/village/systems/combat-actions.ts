import { ensure } from '../../../../../packages/action-runtime/src/json';
import { appendEvent, type ActionCapability } from '../../../../../packages/action-runtime/src/runtime';
import type { Point, VillageState } from '../domain/types';
import { selectWorldRules } from '../config/load';
import { combatEntity, fenceBlocksSegment } from './targeting';
import { resolveAttack } from './combat';
import { distance, supplement } from './resources';
import { nextWaypoint, routeDistance } from './navigation';
import {steerStep,segmentDistance} from '../../../../../packages/world-core/src/steering';
export function moveTowards(state: VillageState, position: Point, target: Point, speed: number, dt: number) {
  const waypoint = nextWaypoint(state, position, target); if (!waypoint) return false; target = waypoint;
  const id=Object.values(state.actors).find(a=>a.position===position)?.id??Object.values(state.combat?.enemies??{}).find(a=>a.position===position)?.id;
  const route=id?state.navigation?.routes[id]:undefined;
  const memory=route?(route.steering??={side:1,until:0,blocked:0}):{side:1 as const,until:0,blocked:0};
  const peers=state.combat?[...Object.values(state.actors).filter(a=>a.body.hp>0).map(a=>a.position),...Object.values(state.combat.enemies).filter(e=>e.hp>0).map(e=>e.position),...(state.wildlife?.ecology.animals??[]).filter(a=>a.hp>0).map(a=>a.position)]:[];
  const next=steerStep(position,target,speed*dt,state.elapsed,(a,b)=>!fenceBlocksSegment(state,a,b)&&peers.every(peer=>peer===position||segmentDistance(a,b,peer)>=.55-1e-8||(distance(a,peer)<.55&&distance(b,peer)>distance(a,peer)+1e-8&&segmentDistance(a,b,peer)>=distance(a,peer)-1e-8)),memory);
  if(!next){if(id&&state.navigation)delete state.navigation.routes[id];return false;}
  Object.assign(position, next); return true;
}
export const COMBAT_CAPABILITIES: ActionCapability<VillageState>[] = ['ATTACK', 'REPOSITION', 'RETREAT', 'GUARD','GOTO_RENDEZVOUS','SEEK_SHELTER'].map(id => ({
  id, validate(state, command) {
    const rules = selectWorldRules('village-v1', state.ruleVersion), actor = combatEntity(state, command.actorId);
    ensure(state.combat && rules.capabilities.combat.configured && actor, 'Combat unavailable');
    const base = supplement<{ baseMoveSpeed: number }>(rules, 'D17').baseMoveSpeed;
    if (id === 'ATTACK') {
      const target = command.targetId && combatEntity(state, command.targetId);
      ensure(target && target.enemy && target.hp > 0 && (state.navigation ? Number.isFinite(routeDistance(state, actor.position, target.position)) : !fenceBlocksSegment(state, actor.position, target.position)), 'Target inaccessible');
      ensure(Object.keys(command.parameters).length === 0, 'Unexpected attack parameters');
      return { duration: Math.max(.1, ((state.navigation ? routeDistance(state, actor.position, target.position) : distance(actor.position, target.position)) - actor.stats.range) / (base * actor.stats.moveSpeed) + .1), cost: {} };
    }
    const p = command.parameters;
    ensure(Object.keys(p).length === 2 && typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y), 'Position required');
    const point = { x: p.x, y: p.y };
    const route = state.navigation ? routeDistance(state, actor.position, point) : distance(actor.position, point);
    ensure(distance(actor.position, point) <= 20 && Number.isFinite(route) && (state.navigation || !fenceBlocksSegment(state, actor.position, point)), 'Position inaccessible');
    return { duration: Math.max(.1, route / (base * actor.stats.moveSpeed)), cost: {} };
  },
  advance(state, execution, dt) {
    const actor = combatEntity(state, execution.command.actorId)!;
    const target = id === 'ATTACK' ? combatEntity(state, execution.command.targetId!)?.position : execution.command.parameters as unknown as Point;
    ensure(target, 'Target disappeared');
    if(['RETREAT','SEEK_SHELTER','GOTO_RENDEZVOUS'].includes(id)&&distance(actor.position,target)<=1.5&&!fenceBlocksSegment(state,actor.position,target))return;
    if (id === 'ATTACK' && distance(actor.position, target) <= actor.stats.range) return;
    const base = supplement<{ baseMoveSpeed: number }>(selectWorldRules('village-v1', state.ruleVersion), 'D17').baseMoveSpeed;
    ensure(moveTowards(state, actor.position, target, base * actor.stats.moveSpeed, dt), 'Route blocked by fence');
  },
  complete(state, execution) {
    const gate=state.combat?.fenceGeometry.gatePosition,actorId=execution.command.actorId;
    if(id==='GUARD'&&gate&&state.combat!.gateOpen&&state.wildlife?.ecology.tide?.alert?.severity&&distance(state.actors[actorId].position,gate)<=4&&Object.values(state.institutions??{}).some(r=>r.kind==='guard-duty'&&r.members.includes(actorId)&&r.effectiveAt<=state.elapsed&&state.elapsed<r.expiresAt)){state.combat!.gateOpen=false;state.combat!.navigationRevision++;appendEvent(state,'gate.changed',[actorId],{open:false,reason:'wildlife-warning'});}
    if (id === 'ATTACK') {
      const result = resolveAttack(state, { attackerId: execution.command.actorId, targetId: execution.command.targetId! });
      ensure(result.applied || result.reason === 'cooldown', result.reason ?? 'Attack failed');
    } else appendEvent(state, 'actor.positioned', [execution.command.actorId], { action: id, position: { ...state.actors[execution.command.actorId].position } }, execution.id);
  },
}));
