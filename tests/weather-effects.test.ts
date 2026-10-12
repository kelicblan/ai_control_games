import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { createGame } from '../src/game/engine';
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
});
