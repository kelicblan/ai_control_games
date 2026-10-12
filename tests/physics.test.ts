import { describe, expect, it } from 'vitest';
import { advanceGame, createGame, getObservation, issueCommand } from '../src/game/engine';
import { ACTIONS, type ActionId, type GameCommand, type GameState, type Point, type PolicyFunction } from '../src/game/types';
import { isWalkable, moveBody, projectToWalkable } from '../src/game/physics';
import { baselinePolicy } from '../src/ai/policy';
import { getTaskDestination, NAVIGATION_CLEARANCE, NPC_RADIUS } from '../src/game/terrain';

const choose = (action: ActionId): PolicyFunction => () => ({
  action, emotion: 'calm', scores: ACTIONS.map(item => Number(item === action)), source: 'rules', latencyMs: 0,
});
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function scene(position: Point): GameState {
  const state: GameState = { ...createGame({ seed: 17 }), status: 'playing' };
  state.npcs[0].position = { ...position };
  state.npcs[0].destination = { ...position };
  for (const npc of state.npcs) npc.decisionIn = 100;
  return state;
}

function move(state: GameState, target: Point): GameState {
  return issueCommand(state, { type: 'move', npcId: 'azhuang', target } as GameCommand);
}

describe('ground navigation and physical contacts', () => {
  it('blocks characters at the visible forest framing trees', () => {
    const trees = [[9, 62, 1.3], [18, 78, 1.5], [37, 85, 1.5], [58, 91, 1.7],
      [82, 82, 1.5], [91, 28, 1.5], [61, 20, 1.7], [31, 20, 1.5]];
    for (const [x, y, radius] of trees) {
      const result = moveBody({ x, y: y + 6 }, { x, y }, 32, .25, [], 'azhuang', { manual: true });
      expect(gap(result.position, { x, y }), `tree at ${x},${y}`).toBeGreaterThanOrEqual(radius + NPC_RADIUS);
      expect(result.contacts.some(contact => contact.kind === 'tree'), `tree at ${x},${y}`).toBe(true);
    }
  });

  it('keeps every normal job station outside all forest and prop navigation margins', () => {
    for (const npcId of ['azhuang', 'xiaomi', 'laozhou'] as const) for (const action of ACTIONS) {
      expect(isWalkable(getTaskDestination(action, npcId), true, NAVIGATION_CLEARANCE), `${npcId} ${action}`).toBe(true);
    }
    for (const npcId of ['azhuang', 'xiaomi', 'laozhou'] as const) for (const action of ['camp', 'rest'] as const) {
      expect(isWalkable(getTaskDestination(action, npcId, true), true, NAVIGATION_CLEARANCE), `${npcId} delivery`).toBe(true);
    }
  });

  it('routes an autonomous crossing around the fire for every simulation step', () => {
    let state = scene({ x: 42, y: 54 });
    state.npcs[0].action = 'camp';
    state.npcs[0].destination = { x: 62, y: 54 };
    state.npcs[0].actionDuration = 100;
    for (let step = 0; step < 32; step++) {
      state = advanceGame(state, .25, choose('camp'));
      expect(gap(state.npcs[0].position, { x: 51, y: 54 })).toBeGreaterThanOrEqual(4.4 - .001);
    }
    expect(gap(state.npcs[0].position, { x: 62, y: 54 })).toBeLessThan(1.1);
    expect(state.npcs[0].health).toBe(100);
  });

  it('keeps autonomous crowd avoidance outside the fire danger margin', () => {
    let state: GameState = { ...createGame({ seed: 17 }), status: 'playing' };
    for (let step = 0; step < 176; step++) {
      state = advanceGame(state, .25, baselinePolicy);
      expect(state.events.some(event => event.reaction?.kind === 'burn')).toBe(false);
    }
    expect(state.stats.gatheredWood).toBeGreaterThan(0);
    expect(state.stats.gatheredFood).toBeGreaterThan(0);
  });

  it('finishes a fire task at a safe station without stepping into the flame', () => {
    let state = scene({ x: 51, y: 64 });
    state.fire = 55;
    state.npcs[0].decisionIn = 0;
    const originalWood = state.wood;
    for (let step = 0; step < 28 && state.wood === originalWood; step++) {
      state = advanceGame(state, .25, choose('fire'));
      expect(gap(state.npcs[0].position, { x: 51, y: 54 })).toBeGreaterThanOrEqual(4.4 - .001);
    }
    expect(state.wood).toBe(originalWood - 1);
    expect(state.fire).toBeGreaterThan(65);
    expect(state.npcs[0].health).toBe(100);
  });

  it('lets a ground command reach a dangerous fire edge, react once, and retreat', () => {
    let state = move(scene({ x: 51, y: 65 }), { x: 51, y: 54 });
    for (let step = 0; step < 12; step++) state = advanceGame(state, .25, choose('camp'));
    const burns = state.events.filter(event => event.reaction?.kind === 'burn');
    expect(burns).toHaveLength(1);
    expect(burns[0].reaction?.objectId).toBe('campfire');
    expect(burns[0].reaction?.utterance).toMatch(/烫|火/);
    expect(state.npcs[0].health).toBeLessThan(98);
    expect(state.npcs[0].injured).toBe(true);
    expect(state.npcs[0].manualTarget).toBeUndefined();
    expect(gap(state.npcs[0].position, { x: 51, y: 54 })).toBeGreaterThan(5.3);
    expect(getObservation(state, state.npcs[0]).features).toHaveLength(36);
    expect(getObservation(state, state.npcs[0]).features[16]).toBe(1);
  });

  it.each([
    ['thorns', { x: 71, y: 46 }, { x: 80, y: 46 }],
    ['water', { x: 79, y: 59 }, { x: 89, y: 59 }],
  ] as const)('gives %s its own contact injury and utterance', (kind, from, target) => {
    let state = move(scene(from), target);
    for (let step = 0; step < 14; step++) state = advanceGame(state, .25, choose('camp'));
    const reaction = state.events.find(event => event.reaction?.kind === kind)?.reaction;
    expect(reaction).toBeDefined();
    expect(reaction!.intensity).toBeGreaterThan(0);
    expect(reaction!.utterance).toMatch(kind === 'thorns' ? /刺|荆棘|扎/ : /水|冷|滑/);
    expect(state.npcs[0].health).toBeLessThan(100);
    expect(state.npcs[0].manualTarget).toBeUndefined();
  });

  it('keeps two opposing walkers separated without a permanent crowd deadlock', () => {
    let state = scene({ x: 37, y: 82 });
    state.npcs[1].position = { x: 61, y: 82 };
    state.npcs[2].position = { x: 20, y: 82 };
    for (const [index, destination] of [{ x: 61, y: 82 }, { x: 37, y: 82 }].entries()) {
      state.npcs[index].action = 'camp';
      state.npcs[index].destination = destination;
      state.npcs[index].actionDuration = 100;
    }
    for (let step = 0; step < 48; step++) {
      state = advanceGame(state, .25, choose('camp'));
      expect(gap(state.npcs[0].position, state.npcs[1].position)).toBeGreaterThanOrEqual(2.2 - .005);
    }
    expect(gap(state.npcs[0].position, { x: 61, y: 82 })).toBeLessThan(1.1);
    expect(gap(state.npcs[1].position, { x: 37, y: 82 })).toBeLessThan(1.1);
    expect(state.npcs[0].health).toBe(100);
    expect(state.npcs[1].health).toBe(100);
  });

  it('bounds repeated damage per NPC and object while keeping each later injury visible', () => {
    let state = scene({ x: 51, y: 54 });
    for (let step = 0; step < 16; step++) {
      // Force contact again to model a stubborn repeated player command or a corrupt old position.
      state.npcs[0].position = { x: 51, y: 54 };
      state.npcs[0].destination = { x: 51, y: 54 };
      state = advanceGame(state, .25, choose('camp'));
      if (step === 7) {
        expect(state.events.filter(event => event.reaction?.kind === 'burn')).toHaveLength(1);
        expect(state.npcs[0].health).toBeGreaterThan(94);
      }
    }
    expect(state.events.filter(event => event.reaction?.kind === 'burn')).toHaveLength(2);
    expect(state.npcs[0].collision?.lastHit?.time).toBeGreaterThan(2.5);
    expect(state.npcs[0].health).toBeGreaterThan(89);
    expect(state.npcs[0].collision?.objectCooldowns.campfire).toBeGreaterThan(state.elapsed);
  });

  it('blocks a high-speed sweep against solid circles and boxes without tunneling', () => {
    const fire = moveBody({ x: 51, y: 66 }, { x: 51, y: 54 }, 160, .25, [], 'azhuang', { manual: true });
    expect(gap(fire.position, { x: 51, y: 54 })).toBeGreaterThanOrEqual(4.4);
    expect(fire.contacts.some(contact => contact.objectId === 'campfire')).toBe(true);
    const box = moveBody({ x: 20, y: 67 }, { x: 32, y: 67 }, 160, .25, [], 'azhuang', { manual: true });
    expect(box.position.x).toBeLessThanOrEqual(27.4);
    expect(box.contacts.some(contact => contact.objectId === 'camp-storage')).toBe(true);
    expect(isWalkable(box.position, false)).toBe(true);
  });

  it('projects a tight gap between overlapping safety margins onto a reachable safe bank', () => {
    const safe = projectToWalkable({ x: 84.4, y: 46 }, true, undefined, .35);
    expect(isWalkable(safe, true, .35)).toBe(true);
    expect(gap(safe, { x: 84.4, y: 46 })).toBeLessThan(8);
  });

  it('updates the visible injury source when a different hazard hurts during the speech cooldown', () => {
    let state = advanceGame(scene({ x: 51, y: 54 }), .25, choose('camp'));
    state = advanceGame(state, 1.25, choose('camp'));
    const previousHealth = state.npcs[0].health;
    state.npcs[0].position = { x: 89, y: 59 };
    state.npcs[0].destination = { x: 89, y: 59 };
    state = advanceGame(state, .25, choose('camp'));
    expect(state.npcs[0].health).toBeLessThan(previousHealth - 1);
    expect(state.npcs[0].collision?.lastHit?.kind).toBe('water');
    expect(state.npcs[0].collision?.lastHit?.time).toBe(state.elapsed);
  });

  it('repairs old positions inside a solid without treating a stationary overlap as a fast impact', () => {
    const state = advanceGame(scene({ x: 36, y: 47 }), .25, choose('camp'));
    expect(gap(state.npcs[0].position, { x: 36, y: 47 })).toBeGreaterThanOrEqual(3.7);
    expect(state.npcs[0].health).toBe(100);
    expect(state.events.some(event => event.reaction?.kind === 'impact')).toBe(false);
  });

  it('only scrapes on a fast rock impact, while slow contact and ordinary props merely block', () => {
    let fast = move(scene({ x: 27, y: 47 }), { x: 36, y: 47 });
    let slow = move(scene({ x: 27, y: 47 }), { x: 36, y: 47 });
    slow.npcs[0].energy = 8;
    slow.npcs[0].injured = true;
    let box = move(scene({ x: 23, y: 67 }), { x: 32, y: 67 });
    for (let step = 0; step < 12; step++) {
      fast = advanceGame(fast, .25, choose('camp'));
      slow = advanceGame(slow, .25, choose('camp'));
      box = advanceGame(box, .25, choose('camp'));
    }
    expect(fast.events.some(event => event.reaction?.kind === 'impact')).toBe(true);
    expect(fast.npcs[0].health).toBeLessThan(99);
    expect(slow.events.some(event => event.reaction?.kind === 'impact')).toBe(false);
    expect(slow.npcs[0].health).toBeGreaterThan(99.8);
    expect(box.events.some(event => event.reaction?.kind === 'bump')).toBe(true);
    expect(box.npcs[0].health).toBe(100);
  });

  it('preserves paused ground orders, then resumes autonomous decisions after arrival', () => {
    const paused = move({ ...scene({ x: 45, y: 77 }), status: 'paused' }, { x: 52, y: 77 });
    expect(advanceGame(paused, 12, choose('camp'))).toEqual(paused);
    const moved = advanceGame({ ...paused, status: 'playing' }, 1, choose('camp'));
    expect(gap(moved.npcs[0].position, { x: 52, y: 77 })).toBeLessThan(.2);
    expect(moved.npcs[0].manualTarget).toBeUndefined();
    expect(moved.npcs[0].action).toBeNull();
    const autonomous = advanceGame(moved, 1, choose('camp'));
    expect(autonomous.npcs[0].action).toBe('camp');
    expect(autonomous.decisions.some(decision => decision.npcId === 'azhuang')).toBe(true);
  });

  it('resolves a manual destination occupied by a stationary companion and restores autonomy', () => {
    let state = scene({ x: 43, y: 65 });
    state.npcs[1].position = { x: 49, y: 65 };
    state.npcs[1].destination = { x: 49, y: 65 };
    state.npcs[1].action = 'camp';
    state.npcs[1].actionDuration = 100;
    state = move(state, { x: 47.5, y: 65 });
    for (let step = 0; step < 40; step++) state = advanceGame(state, .25, choose('camp'));
    expect(state.npcs[0].manualTarget).toBeUndefined();
    expect(state.decisions.some(decision => decision.npcId === 'azhuang')).toBe(true);
    expect(state.events.filter(event => event.npcId === 'azhuang' && event.reaction?.kind === 'bump').length).toBeLessThan(3);
    expect(gap(state.npcs[0].position, state.npcs[1].position)).toBeGreaterThanOrEqual(2.2 - .005);
  });

  it('does not abandon a reachable manual destination when a companion only blocks the route', () => {
    let state = scene({ x: 37, y: 82 });
    state.npcs[1].position = { x: 49, y: 82 };
    state.npcs[1].destination = { x: 49, y: 82 };
    state.npcs[1].action = 'camp';
    state.npcs[1].actionDuration = 100;
    state.npcs[2].position = { x: 20, y: 82 };
    const target = { x: 61, y: 82 };
    state = move(state, target);
    for (let step = 0; step < 80 && state.npcs[0].manualTarget; step++) state = advanceGame(state, .25, choose('camp'));
    expect(state.npcs[0].manualTarget).toBeUndefined();
    expect(gap(state.npcs[0].position, target)).toBeLessThan(.2);
  });

  it.each([.1, .25])('routes around a resting companion beside the tent without getting pinned (dt=%s)', dt => {
    let state = scene({ x: 68, y: 73.2 });
    state.npcs[0].action = 'rest';
    state.npcs[0].actionDuration = 100;
    state.npcs[1].position = { x: 78, y: 80 };
    state.npcs[1].destination = { x: 49, y: 65 };
    state.npcs[1].action = 'camp';
    state.npcs[1].actionDuration = 100;
    state.npcs[2].position = { x: 20, y: 82 };
    state.npcs[2].destination = { x: 20, y: 82 };
    for (let step = 0; step < 12 / dt; step++) {
      state = advanceGame(state, dt, choose('camp'));
      expect(isWalkable(state.npcs[1].position)).toBe(true);
      expect(gap(state.npcs[0].position, state.npcs[1].position)).toBeGreaterThanOrEqual(2.2 - .005);
    }
    expect(gap(state.npcs[1].position, { x: 49, y: 65 })).toBeLessThan(.2);
    expect(state.npcs[1].progress).toBeGreaterThan(0);
    expect(state.events.some(event => event.reaction?.kind === 'burn')).toBe(false);
  });

  it('finishes helping from outside the injured companion body', () => {
    let state = scene({ x: 46, y: 65 });
    state.npcs[0].health = 40;
    state.npcs[0].injured = true;
    state.npcs[1].position = { x: 56, y: 65 };
    state.npcs[1].decisionIn = 0;
    for (let step = 0; step < 48 && state.stats.helps === 0; step++) {
      state = advanceGame(state, .25, choose('help'));
      expect(gap(state.npcs[0].position, state.npcs[1].position)).toBeGreaterThanOrEqual(2.2 - .005);
    }
    expect(state.stats.helps).toBeGreaterThan(0);
    expect(state.npcs[0].injured).toBe(false);
    expect(state.npcs[0].health).toBeGreaterThan(60);
  });
});
