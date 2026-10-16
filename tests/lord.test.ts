import { describe, expect, it } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { createLord, advanceLord, setLordInput } from '../src/games/camp/simulation/lord';

describe('authoritative directional lord movement', () => {
  it('moves at a capped speed and stops immediately when input clears', () => {
    const state = createGame({ seed: 17 }); state.lord = createLord(17); state.status = 'playing';
    const origin = { ...state.lord.position };
    setLordInput(state.lord, { x: 1, y: 1 });
    expect(state.lord.position).toEqual(origin);
    advanceLord(state, .1);
    expect(Math.hypot(state.lord.position.x - origin.x, state.lord.position.y - origin.y)).toBeCloseTo(.8);
    setLordInput(state.lord);
    const stopped = { ...state.lord.position }; advanceLord(state, .1);
    expect(state.lord.position).toEqual(stopped);
  });
  it('keeps movement behind solid house walls without routing around them', () => {
    const state = createGame({ seed: 17 }); state.lord = createLord(17); state.status = 'playing';
    state.lord.position = { x: 20, y: -45 }; setLordInput(state.lord, { x: 1, y: 0 });
    for (let i = 0; i < 20; i++) advanceLord(state, .1);
    expect(state.lord.position.x).toBeLessThan(23);
    expect(state.lord.position.y).toBe(-45);
  });
  it('never moves while paused or with invalid elapsed time', () => {
    const state = createGame(); state.lord = createLord(); state.status = 'paused';
    setLordInput(state.lord, { x: 1, y: 0 }); const origin = { ...state.lord.position };
    advanceLord(state, .1); state.status = 'playing'; advanceLord(state, NaN); advanceLord(state, -1);
    expect(state.lord.position).toEqual(origin);
  });
});
