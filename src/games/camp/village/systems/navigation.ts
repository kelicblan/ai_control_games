import { findGridRoute } from '../../../../../packages/world-core/src/navigation';
import { worldCanTraverse } from '../../world/navigation';
import {newWorld,newWorldRoute} from '../../world/newWorldProfile';
import type { Point, VillageState } from '../domain/types';
import { distance } from './resources';
export function routeTo(state: VillageState, from: Point, target: Point): Point[] {
  if (!state.navigation) return [target];
  const gateOpen = !state.combat || state.economy!.fence.hp <= 0 || state.combat.gateOpen === true;
  if(newWorld)return newWorldRoute(from,target,gateOpen);
  const check = (a: Point, b: Point) => worldCanTraverse(a, b, state.seed, gateOpen);
  if (check(from, target)) return [target];
  const route = findGridRoute(from, target, check, { step: .5, maxNodes: 8192, maxDistance: 128 });
  return route.reached ? route.points : [];
}
export function nextWaypoint(state: VillageState, from: Point, target: Point): Point | null {
  if (!state.navigation) return target;
  const id = Object.values(state.actors).find(a => a.position === from)?.id ?? Object.values(state.combat?.enemies ?? {}).find(a => a.position === from)?.id;
  if (!id) return null;
  let route = state.navigation.routes[id]; const revision = state.combat?.navigationRevision ?? 0;
  if (!route || distance(route.target, target) > .5 || route.revision !== revision) route = state.navigation.routes[id] = { target: { ...target }, points: routeTo(state, from, target), revision };
  while (route.points.length && distance(from, route.points[0]) < .1) route.points.shift();
  return route.points[0] ?? (distance(from, target) < .1 ? target : null);
}
export function routeDistance(state: VillageState, from: Point, target: Point) {
  let last = from, total = 0; const points = routeTo(state, from, target); if (!points.length) return Infinity;
  for (const point of points) { total += distance(last, point); last = point; } return total;
}
