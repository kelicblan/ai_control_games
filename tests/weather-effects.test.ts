import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { createGame } from '../src/games/camp/simulation/engine';
import { createWeatherEffects } from '../src/scene/weather';

function leafPositions(leaves: InstancedMesh): Vector3[] {
  const matrix = new Matrix4();
  return Array.from({ length: leaves.count }, (_, index) => {
    leaves.getMatrixAt(index, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  });
}
const wrappedDelta = (delta: number) => ((delta + 156) % 104) - 52;

describe('weather particle motion', () => {
  it('advects existing leaves smoothly instead of teleporting them when late-game wind turns', () => {
    const effects = createWeatherEffects(), game = createGame({ seed: 17 });
    Object.assign(game.atmosphere, { windStrength: .8, windAngle: 0 });
    effects.update(100, game, false);
    const leaves = effects.group.getObjectByName('Wind-carried woodland leaves') as InstancedMesh;
    const before = leafPositions(leaves);
    game.atmosphere.windAngle = .03;
    effects.update(100.1, game, false);
    for (const [i, next] of leafPositions(leaves).entries()) {
      const dx = wrappedDelta(next.x - before[i].x), dz = wrappedDelta(next.z - before[i].z);
      expect(Math.hypot(dx, dz)).toBeLessThan(1.5);
      expect(dx).toBeGreaterThan(0);
      expect(dz).toBeGreaterThanOrEqual(0);
    }
  });

  it('holds particle positions at a frozen simulation time, including after a camera redraw', () => {
    const effects = createWeatherEffects(), game = createGame({ seed: 17 });
    Object.assign(game.atmosphere, { windStrength: .8, windAngle: .6 });
    effects.update(8, game, false);
    const leaves = effects.group.getObjectByName('Wind-carried woodland leaves') as InstancedMesh;
    const before = leafPositions(leaves);
    effects.update(8, game, false);
    expect(leafPositions(leaves)).toEqual(before);
    effects.update(9, game, true);
    expect(leaves.visible).toBe(false);
  });

  it('varies rain streak lengths while preserving downwind fall', () => {
    const effects = createWeatherEffects(), game = createGame({ seed: 17 });
    Object.assign(game.atmosphere, { rainIntensity: 1, windStrength: .85, windAngle: .7 });
    const rain = effects.group.getObjectByName('Slanted rain') as Mesh;
    const top = rain.geometry.getAttribute('streakTop'), bottom = rain.geometry.getAttribute('streakBottom');
    expect(top).toBeDefined(); expect(bottom).toBeDefined();
    const length: number[] = [];
    for (const time of [12.3, 12.55, 12.8]) {
      effects.update(time, game, false);
      for (let i = 0; i < top.count; i++) {
        const fall = top.getY(i) - bottom.getY(i);
        if (fall > .1) {
          length.push(fall);
          expect((bottom.getX(i) - top.getX(i)) / fall).toBeCloseTo(Math.cos(.7) * .85 * .22, 3);
          expect((bottom.getZ(i) - top.getZ(i)) / fall).toBeCloseTo(Math.sin(.7) * .85 * .22, 3);
        }
        expect(bottom.getY(i)).toBeGreaterThanOrEqual(.039);
      }
    }
    expect(Math.max(...length)).toBeGreaterThan(Math.min(...length.filter(value => value > .5)) * 2);
  });

  it('freezes rain and hides contact rings at a repeated or reduced simulation time', () => {
    const effects = createWeatherEffects(), game = createGame({ seed: 17 });
    Object.assign(game.atmosphere, { rainIntensity: .8, windStrength: .7 });
    const rain = effects.group.getObjectByName('Slanted rain') as Mesh;
    expect(rain.geometry.getAttribute('streakTop')).toBeDefined();
    const positions = () => Array.from(rain.geometry.getAttribute('streakTop').array);
    effects.update(14, game, false);
    const moving = positions();
    effects.update(14, game, false);
    expect(positions()).toEqual(moving);
    effects.update(14, game, true);
    const still = positions();
    effects.update(25, game, true);
    expect(positions()).toEqual(still);
    expect(effects.group.getObjectByName('Rain rings on earth and water')!.visible).toBe(false);
  });
});
