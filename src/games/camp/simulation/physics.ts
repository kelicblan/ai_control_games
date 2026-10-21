import {newWorld,newWorldProject,newWorldWalkable} from '../world/newWorldProfile';
import { clamp, distance } from './constants';
import { GROUND_BOUNDS, NAVIGATION_CLEARANCE, NPC_RADIUS, TERRAIN as DEFAULT_TERRAIN, type ColliderShape, type TerrainKind, type TerrainObject } from './terrain';
import type { Npc, NpcId, Point } from './types';

const EPSILON = .002;
const RING_POINTS = 12;
const CONTACT_DISTANCE = NPC_RADIUS * 2;
export interface CollisionContact {
  objectId: string;
  kind: TerrainKind | 'npc' | 'boundary';
  point: Point;
  normal: Point;
  impactSpeed: number;
  initialOverlap: boolean;
}
export interface MoveResult {
  position: Point;
  distanceMoved: number;
  contacts: CollisionContact[];
  arrived: boolean;
}
interface Sweep { time: number; normal: Point }
interface Peer { id: NpcId; position: Point; alive?: boolean }
interface Graph { points: Point[]; edges: { to: number; cost: number }[][] }


/** 每个局部碰撞集合拥有自己的导航图缓存；不存在跨世界种子的全局可变障碍集。 */
export function createPhysics(TERRAIN: readonly TerrainObject[] = DEFAULT_TERRAIN) {
const graphs = new Map<boolean, Graph>();
// Immutable broad phase. Keep source order so contact tie-breaking/replays stay
// identical, while a step near the fire does not scan every distant fence post.
const cells=new Map<string,TerrainObject[]>(),unindexed:TerrainObject[]=[],order=new Map<TerrainObject,number>();
const indexPadding=NPC_RADIUS+NAVIGATION_CLEARANCE+Math.max(0,...TERRAIN.map(o=>o.hazard?.reach??0))+1;
TERRAIN.forEach((object,i)=>{
 order.set(object,i);const s=object.shape,hx=(s.type==='circle'?s.radius:s.half.x)+indexPadding,hy=(s.type==='circle'?s.radius:s.half.y)+indexPadding;
 const minX=Math.floor((s.center.x-hx)/32),maxX=Math.floor((s.center.x+hx)/32),minY=Math.floor((s.center.y-hy)/32),maxY=Math.floor((s.center.y+hy)/32);
 if((maxX-minX+1)*(maxY-minY+1)>1024){unindexed.push(object);return;}
 for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){const key=`${x}:${y}`,list=cells.get(key)??[];list.push(object);cells.set(key,list);}
});
function nearby(from:Point,to=from,extra=0):readonly TerrainObject[]{
 if(extra>1)return TERRAIN;
 const minX=Math.floor(Math.min(from.x,to.x)/32),maxX=Math.floor(Math.max(from.x,to.x)/32),minY=Math.floor(Math.min(from.y,to.y)/32),maxY=Math.floor(Math.max(from.y,to.y)/32);
 if((maxX-minX+1)*(maxY-minY+1)>64)return TERRAIN;
 if(minX===maxX&&minY===maxY&&!unindexed.length)return cells.get(`${minX}:${minY}`)??[];
 const found=new Set(unindexed);for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(const object of cells.get(`${x}:${y}`)??[])found.add(object);
 return [...found].sort((a,b)=>order.get(a)!-order.get(b)!);
}
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const multiply = (a: Point, factor: number): Point => ({ x: a.x * factor, y: a.y * factor });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
function unit(point: Point, fallback: Point = { x: 0, y: 1 }): Point {
  const length = Math.hypot(point.x, point.y);
  return length > 1e-9 ? multiply(point, 1 / length) : { ...fallback };
}

function margin(object: TerrainObject, avoidHazards: boolean, clearance = 0): number {
  return NPC_RADIUS + clearance + (avoidHazards ? object.hazard?.reach ?? 0 : 0);
}
function blocks(object: TerrainObject, avoidHazards: boolean): boolean {
  return object.solid || (avoidHazards && !!object.hazard);
}
function contains(shape: ColliderShape, point: Point, padding: number, tolerance = 0): boolean {
  if (shape.type === 'circle') return distance(shape.center, point) < shape.radius + padding - tolerance;
  return Math.abs(point.x - shape.center.x) < shape.half.x + padding - tolerance
    && Math.abs(point.y - shape.center.y) < shape.half.y + padding - tolerance;
}

function outward(shape: ColliderShape, point: Point, padding: number, from?: Point): Point {
  if (shape.type === 'circle') return unit(subtract(point, shape.center), from ? unit(subtract(from, shape.center)) : undefined);
  const local = subtract(point, shape.center);
  const dx = shape.half.x + padding - Math.abs(local.x);
  const dy = shape.half.y + padding - Math.abs(local.y);
  if ((Math.abs(dx - dy) < 1e-8 || Math.hypot(local.x, local.y) < 1e-8) && from) {
    const incoming = subtract(from, shape.center);
    if (Math.abs(incoming.x) > Math.abs(incoming.y)) return { x: Math.sign(incoming.x) || 1, y: 0 };
    return { x: 0, y: Math.sign(incoming.y) || 1 };
  }
  return dx < dy ? { x: Math.sign(local.x) || Math.sign((from?.x ?? point.x) - shape.center.x) || 1, y: 0 }
    : { x: 0, y: Math.sign(local.y) || Math.sign((from?.y ?? point.y) - shape.center.y) || 1 };
}

/** A moving disk is swept against a circle or a conservatively expanded box. */
function sweep(shape: ColliderShape, start: Point, delta: Point, padding: number): Sweep | null {
  const lengthSquared = dot(delta, delta);
  if (contains(shape, start, padding, 1e-7)) return { time: 0, normal: outward(shape, start, padding) };
  if (lengthSquared < 1e-16) return null;
  if (shape.type === 'circle') {
    const local = subtract(start, shape.center);
    const radius = shape.radius + padding;
    const b = dot(local, delta);
    const c = dot(local, local) - radius * radius;
    if (c <= 1e-7 && b >= 0) return null;
    const discriminant = b * b - lengthSquared * c;
    if (discriminant < 0) return null;
    const time = (-b - Math.sqrt(discriminant)) / lengthSquared;
    if (time < -1e-7 || time > 1 + 1e-7) return null;
    return { time: Math.max(0, time), normal: unit(add(local, multiply(delta, Math.max(0, time)))) };
  }
  let entry = -Infinity;
  let exit = Infinity;
  let normal: Point = { x: 0, y: 0 };
  for (const axis of ['x', 'y'] as const) {
    const low = shape.center[axis] - shape.half[axis] - padding;
    const high = shape.center[axis] + shape.half[axis] + padding;
    if (Math.abs(delta[axis]) < 1e-10) {
      if (start[axis] < low || start[axis] > high) return null;
      continue;
    }
    const t1 = (low - start[axis]) / delta[axis];
    const t2 = (high - start[axis]) / delta[axis];
    const near = Math.min(t1, t2);
    if (near > entry) {
      entry = near;
      normal = axis === 'x' ? { x: -Math.sign(delta.x), y: 0 } : { x: 0, y: -Math.sign(delta.y) };
    }
    exit = Math.min(exit, Math.max(t1, t2));
    if (entry > exit) return null;
  }
  if (entry < -1e-7 || entry > 1 + 1e-7 || exit < 0) return null;
  return { time: Math.max(0, entry), normal };
}

function bound(point: Point): Point {
  return {
    x: clamp(point.x, GROUND_BOUNDS.minX + NPC_RADIUS, GROUND_BOUNDS.maxX - NPC_RADIUS),
    y: clamp(point.y, GROUND_BOUNDS.minY + NPC_RADIUS, GROUND_BOUNDS.maxY - NPC_RADIUS),
  };
}

function isWalkable(point: Point, avoidHazards = true, clearance = 0): boolean {
  const bounded = bound(point);
  return distance(point, bounded) < 1e-7 && !nearby(point,point,clearance).some(object => blocks(object, avoidHazards)
    && contains(object.shape, point, margin(object, avoidHazards, clearance), 1e-7));
}

/** Also repairs valid old saves whose positions now overlap a newly introduced prop. */
function projectToWalkable(point: Point, avoidHazards = true, from?: Point, clearance = 0): Point {
  let result = bound(point);
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const object of nearby(result,result,clearance)) {
      if (!blocks(object, avoidHazards)) continue;
      const padding = margin(object, avoidHazards, clearance);
      if (!contains(object.shape, result, padding)) continue;
      const normal = outward(object.shape, result, padding, from);
      if (object.shape.type === 'circle') {
        result = add(object.shape.center, multiply(normal, object.shape.radius + padding + EPSILON));
      } else {
        if (normal.x !== 0) result.x = object.shape.center.x + normal.x * (object.shape.half.x + padding + EPSILON);
        else result.y = object.shape.center.y + normal.y * (object.shape.half.y + padding + EPSILON);
      }
      result = bound(result);
      changed = true;
    }
    if (!changed) break;
  }
  if (!isWalkable(result, avoidHazards, clearance)) {
    // Adjacent inflated obstacles can project back into each other. Search outward in a
    // fixed order for the nearest free neighborhood instead of returning that oscillation.
    const origin = bound(point);
    for (let radius = .5; radius <= 100; radius += .5) for (let index = 0; index < 24; index++) {
      const angle = index * Math.PI * 2 / 24;
      const candidate = bound({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius });
      if (isWalkable(candidate, avoidHazards, clearance)) return candidate;
    }
  }
  return result;
}

function clearSegment(from: Point, to: Point, avoidHazards: boolean, clearance: number): boolean {
  const delta = subtract(to, from);
  const minX=Math.min(from.x,to.x),maxX=Math.max(from.x,to.x),minY=Math.min(from.y,to.y),maxY=Math.max(from.y,to.y);
  return !nearby(from,to,clearance).some(object => {
    if(!blocks(object,avoidHazards))return false;
    const padding=margin(object,avoidHazards,clearance),s=object.shape;
    const hx=(s.type==='circle'?s.radius:s.half.x)+padding,hy=(s.type==='circle'?s.radius:s.half.y)+padding;
    if(s.center.x+hx<minX||s.center.x-hx>maxX||s.center.y+hy<minY||s.center.y-hy>maxY)return false;
    return sweep(s,from,delta,padding)!==null;
  });
}

function staticGraph(avoidHazards: boolean): Graph {
  const cached = graphs.get(avoidHazards);
  if (cached) return cached;
  const clearance = avoidHazards ? NAVIGATION_CLEARANCE : .02;
  const points: Point[] = [];
  for (const object of TERRAIN) {
    if (!blocks(object, avoidHazards)) continue;
    if(object.navigationPoints){points.push(...object.navigationPoints);continue;}
    const padding = margin(object, avoidHazards, clearance) + .035;
    if (object.shape.type === 'circle') {
      // Chords between neighboring ring points must also clear the expanded circle.
      const radius = (object.shape.radius + padding) / Math.cos(Math.PI / RING_POINTS);
      for (let index = 0; index < RING_POINTS; index++) {
        const angle = index * Math.PI * 2 / RING_POINTS;
        points.push(add(object.shape.center, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }));
      }
    } else {
      for (const [x, y] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) points.push({
        x: object.shape.center.x + x * (object.shape.half.x + padding),
        y: object.shape.center.y + y * (object.shape.half.y + padding),
      });
    }
  }
  const usable = points.filter(point => isWalkable(point, avoidHazards, clearance));
  const edges: Graph['edges'] = usable.map(() => []);
  for (let a = 0; a < usable.length; a++) for (let b = a + 1; b < usable.length; b++) {
    if (!clearSegment(usable[a], usable[b], avoidHazards, clearance)) continue;
    const cost = distance(usable[a], usable[b]);
    edges[a].push({ to: b, cost });
    edges[b].push({ to: a, cost });
  }
  const graph = { points: usable, edges };
  graphs.set(avoidHazards, graph);
  return graph;
}

/** Immutable geometry plus stable index tie-breaking make route decisions replayable. */
function findRoute(from: Point, target: Point, avoidHazards = true): Point[] {
  const clearance = avoidHazards ? NAVIGATION_CLEARANCE : .02;
  const start = projectToWalkable(from, avoidHazards, undefined, clearance);
  const goal = projectToWalkable(target, avoidHazards, from, clearance);
  if (distance(from, start) > .03) return [start];
  if (clearSegment(start, goal, avoidHazards, clearance)) return [goal];
  const graph = staticGraph(avoidHazards);
  const count = graph.points.length;
  const costs = new Float64Array(count + 1).fill(Infinity);
  const parents = new Int32Array(count + 1).fill(-1);
  const visited = new Uint8Array(count + 1);
  for (let index = 0; index < count; index++) {
    if (clearSegment(start, graph.points[index], avoidHazards, clearance)) costs[index] = distance(start, graph.points[index]);
  }
  for (let iteration = 0; iteration <= count; iteration++) {
    let current = -1;
    let minimum = Infinity;
    for (let index = 0; index <= count; index++) if (!visited[index] && costs[index] < minimum - 1e-9) {
      current = index;
      minimum = costs[index];
    }
    if (current < 0) break;
    if (current === count) {
      const route = [goal];
      let parent = parents[current];
      while (parent >= 0) { route.push(graph.points[parent]); parent = parents[parent]; }
      return route.reverse().map(point => ({ ...point }));
    }
    visited[current] = 1;
    for (const edge of graph.edges[current]) {
      const candidate = minimum + edge.cost;
      if (!visited[edge.to] && candidate < costs[edge.to] - 1e-9) {
        costs[edge.to] = candidate;
        parents[edge.to] = current;
      }
    }
    if (clearSegment(graph.points[current], goal, avoidHazards, clearance)) {
      const candidate = minimum + distance(graph.points[current], goal);
      if (candidate < costs[count] - 1e-9) { costs[count] = candidate; parents[count] = current; }
    }
  }
  // An unreachable target must stop safely, never fall back to a straight line through a prop.
  return [];
}

function steerAroundPeers(position: Point, desired: Point, speed: number, peers: readonly Peer[], id: NpcId, avoidHazards: boolean, allowWideEscape = true): Point {
  const heading = unit(desired);
  let side = 0;
  for (const peer of peers) {
    if (peer.id === id || peer.alive === false) continue;
    const relative = subtract(peer.position, position);
    const ahead = dot(relative, heading);
    const across = heading.x * relative.y - heading.y * relative.x;
    if (ahead > -.15 && ahead < 5.2 && Math.abs(across) < CONTACT_DISTANCE + .7) {
      // Everyone passes on their own right; opposing headings pick opposite world sides.
      side += (1 - Math.max(0, ahead) / 5.2) * (1 - Math.abs(across) / (CONTACT_DISTANCE + .7)) * 1.6;
    }
  }
  if (side <= .001) return desired;
  const right = unit(add(heading, { x: -heading.y * side, y: heading.x * side }));
  const left = unit(add(heading, { x: heading.y * side, y: -heading.x * side }));
  const lookahead = Math.max(5.5, speed);
  const freeTravel = (direction: Point): number => {
    const delta = multiply(direction, lookahead);
    let free = lookahead;
    for (const object of nearby(position,add(position,delta))) {
      if (!blocks(object, avoidHazards)) continue;
      const hit = sweep(object.shape, position, delta, avoidHazards ? margin(object, true, .08) : NPC_RADIUS);
      if (hit && !(hit.time === 0 && dot(delta, hit.normal) >= 0)) free = Math.min(free, hit.time * lookahead);
    }
    for (const peer of peers) {
      if (peer.id === id || peer.alive === false) continue;
      const hit = sweep({ type: 'circle', center: peer.position, radius: NPC_RADIUS }, position, delta, NPC_RADIUS);
      if (hit && !(hit.time === 0 && dot(delta, hit.normal) >= 0)) free = Math.min(free, hit.time * lookahead);
    }
    return free;
  };
  // Prefer the common passing side in open space, but do not choose it into a wall
  // when the opposite side gives a clear path around a resting companion.
  const leftFree = freeTravel(left), rightFree = freeTravel(right);
  let direction = leftFree > rightFree + .05 ? left : right;
  // Two shallow passing turns can both point into the gap between adjacent
  // companions. Sample a wider escape only in that blocked case; otherwise a
  // five-person row can pin a walker forever despite plenty of space behind it.
  if (allowWideEscape && Math.max(leftFree, rightFree) < CONTACT_DISTANCE * 1.25) {
    const score = (candidate: Point) => Math.min(freeTravel(candidate), CONTACT_DISTANCE * 1.5)
      + dot(candidate, heading) * .8;
    let best = score(direction);
    for (const angle of [-Math.PI / 2, Math.PI / 2, -Math.PI * .75, Math.PI * .75, Math.PI]) {
      const candidate = { x: heading.x * Math.cos(angle) - heading.y * Math.sin(angle),
        y: heading.x * Math.sin(angle) + heading.y * Math.cos(angle) };
      const value = score(candidate);
      if (value > best + .05) { direction = candidate; best = value; }
    }
  }
  return multiply(direction, Math.min(speed, Math.hypot(desired.x, desired.y)));
}

/** Continuous static/peer collision, sliding, hazard sweeps and safe endpoint handling. */
function moveBody(
  position: Point, destination: Point, speed: number, dt: number,
  peers: readonly Peer[], id: NpcId, options: { manual?: boolean; avoidHazards?: boolean } = {},
): MoveResult {
  // 手动指令与路线安全分开：点安全地面应绕开沿途危险；点危险物才允许主动接触。
  const avoidHazards = options.avoidHazards ?? !options.manual;
  const contacts: CollisionContact[] = [];
  const seen = new Set<string>();
  const record = (objectId: string, kind: CollisionContact['kind'], point: Point, normal: Point, impactSpeed: number, initialOverlap = false) => {
    if (seen.has(objectId)) return;
    seen.add(objectId);
    contacts.push({ objectId, kind, point: { ...point }, normal, impactSpeed, initialOverlap });
  };
  const hazardContacts = (from: Point, delta: Point, actualSpeed: number) => {
    for (const object of nearby(from,add(from,delta))) {
      if (!object.hazard) continue;
      const padding = NPC_RADIUS + object.hazard.reach;
      const hit = sweep(object.shape, from, delta, padding);
      if (hit) record(object.id, object.kind, add(from, multiply(delta, hit.time)), hit.normal, actualSpeed,
        contains(object.shape, from, padding));
    }
  };
  hazardContacts(position, { x: 0, y: 0 }, 0);
  for (const object of nearby(position)) if (object.solid && contains(object.shape, position, NPC_RADIUS)) {
    record(object.id, object.kind, position, outward(object.shape, position, NPC_RADIUS), 0, true);
  }
  let current = projectToWalkable(position, false);
  const goal = projectToWalkable(destination, avoidHazards, current, avoidHazards ? NAVIGATION_CLEARANCE : .02);
  const route = findRoute(current, goal, avoidHazards);
  const waypoint = route[0];
  if (!waypoint || speed <= 0 || dt <= 0) return { position: current, distanceMoved: 0, contacts, arrived: distance(current, goal) <= .1 };
  // A player may intentionally touch a solid object. Navigate to its edge, then let the sweep stop the contact.
  const finalAim = options.manual && route.length === 1 && !isWalkable(destination, false) ? destination : waypoint;
  const delta = subtract(finalAim, current);
  const amount = Math.min(speed * dt, Math.hypot(delta.x, delta.y));
  const approachingCompanion = options.manual === true && peers.some(peer => peer.id !== id && peer.alive !== false
    && distance(goal, peer.position) < CONTACT_DISTANCE);
  let movement = steerAroundPeers(current, multiply(unit(delta), amount), amount, peers, id, avoidHazards, !approachingCompanion);
  let moved = 0;
  for (let iteration = 0; iteration < 3 && Math.hypot(movement.x, movement.y) > 1e-7; iteration++) {
    let earliest: { hit: Sweep; objectId: string; kind: CollisionContact['kind']; avoidance: boolean } | null = null;
    for (const object of nearby(current,add(current,movement))) {
      if (!blocks(object, avoidHazards)) continue;
      // Steering around a companion must not cut through the route's safe clearance.
      // Automatic walkers slide along a safety boundary; player movement can reach real contact.
      const padding = avoidHazards ? margin(object, true, .08) : NPC_RADIUS;
      let hit = sweep(object.shape, current, movement, padding);
      if (avoidHazards && hit?.time === 0 && dot(movement, hit.normal) >= 0) hit = null;
      if (hit && (!earliest || hit.time < earliest.hit.time)) earliest = { hit, objectId: object.id, kind: object.kind, avoidance: avoidHazards };
    }
    for (const peer of peers) {
      if (peer.id === id || peer.alive === false) continue;
      const hit = sweep({ type: 'circle', center: peer.position, radius: NPC_RADIUS }, current, movement, NPC_RADIUS);
      if (hit && (!earliest || hit.time < earliest.hit.time)) earliest = { hit, objectId: peer.id, kind: 'npc', avoidance: false };
    }
    const length = Math.hypot(movement.x, movement.y);
    const fraction = earliest ? Math.max(0, earliest.hit.time - EPSILON / length) : 1;
    const traveled = multiply(movement, fraction);
    hazardContacts(current, traveled, speed);
    current = add(current, traveled);
    moved += Math.hypot(traveled.x, traveled.y);
    if (!earliest) break;
    const impactSpeed = Math.max(0, -dot(unit(movement), earliest.hit.normal) * speed);
    if (!earliest.avoidance) record(earliest.objectId, earliest.kind, current, earliest.hit.normal, impactSpeed);
    const remainder = multiply(movement, 1 - fraction);
    const inward = dot(remainder, earliest.hit.normal);
    movement = inward < 0 ? subtract(remainder, multiply(earliest.hit.normal, inward)) : remainder;
  }
  const bounded = bound(current);
  if (distance(bounded, current) > .001) record('boundary', 'boundary', bounded, unit(subtract(bounded, current)), speed);
  current = projectToWalkable(bounded, false);
  // A player can click ground occupied by a companion. Contact with that particular
  // goal occupant completes the approach; a companion merely crossing the route does not.
  const reachedOccupiedGoal = options.manual === true && contacts.some(contact => contact.kind === 'npc'
    && peers.some(peer => peer.id === contact.objectId && distance(goal, peer.position) < CONTACT_DISTANCE));
  return { position: current, distanceMoved: moved, contacts,
    arrived: distance(current, goal) <= .12 || reachedOccupiedGoal
      || (options.manual === true && contacts.some(contact => contact.kind !== 'npc') && distance(current, goal) <= .25) };
}

/** Sequential sweeps prevent new overlaps; this bounded repair handles old saves and tight crowds. */
function separateNpcs(npcs: Npc[]): void {
  const ordered = [...npcs].filter(npc => npc.alive).sort((a, b) => a.id.localeCompare(b.id));
  for (let pass = 0; pass < 3; pass++) for (let a = 0; a < ordered.length; a++) for (let b = a + 1; b < ordered.length; b++) {
    const first = ordered[a];
    const second = ordered[b];
    const separation = subtract(second.position, first.position);
    const length = Math.hypot(separation.x, separation.y);
    if (length >= CONTACT_DISTANCE + EPSILON) continue;
    const normal = unit(separation, { x: 1, y: 0 });
    const correction = multiply(normal, (CONTACT_DISTANCE + EPSILON - length) / 2);
    first.position = projectToWalkable(subtract(first.position, correction), true);
    second.position = projectToWalkable(add(second.position, correction), true);
  }
}

return {isWalkable,projectToWalkable,findRoute,moveBody,separateNpcs};
}
/** 原营地调用保持API兼容；连续世界通过同一实现创建有预算的局部实例。 */
const legacyPhysics=createPhysics();
export const isWalkable:typeof legacyPhysics.isWalkable=(...args)=>newWorld?newWorldWalkable(args[0]):legacyPhysics.isWalkable(...args);
export const projectToWalkable:typeof legacyPhysics.projectToWalkable=(...args)=>newWorld?newWorldProject(args[0]):legacyPhysics.projectToWalkable(...args);
export const findRoute=legacyPhysics.findRoute;
export const moveBody=legacyPhysics.moveBody;
export const separateNpcs=legacyPhysics.separateNpcs;
