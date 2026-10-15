import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, Vector3, LineSegments } from 'three';
import { createGame } from '../src/games/camp/simulation/engine';
import { createWeatherEffects } from '../src/scene/weather';

describe('weather in the expanded world', () => {
  it('keeps rain, leaves and lightning above real terrain and around the viewing position', () => {
    const effects = createWeatherEffects(undefined, undefined, { groundHeight: () => 120, focus: () => ({ x: 900, y: -400 }) });
    const game = createGame(); Object.assign(game.atmosphere, { rainIntensity: 1, windStrength: .8, windAngle: .4, lightningAt: 100, lightningPoint: { x: 950, y: -350 } });
    effects.update(100.1, game, false);
    const rain = effects.group.getObjectByName('Slanted rain') as Mesh;
    const bottom = rain.geometry.getAttribute('streakBottom');
    for (let i = 0; i < bottom.count; i++) expect(bottom.getY(i)).toBeGreaterThanOrEqual(120);
    const leaves = effects.group.getObjectByName('Wind-carried woodland leaves') as InstancedMesh;
    const matrix = new Matrix4(); leaves.getMatrixAt(0, matrix); const p = new Vector3().setFromMatrixPosition(matrix);
    expect(p.y).toBeGreaterThan(120); expect(Math.abs(p.x - 900)).toBeLessThan(60); expect(Math.abs(p.z + 400)).toBeLessThan(60);
    const bolt = effects.group.getObjectByName('Lightning at the world strike') as LineSegments;
    const positions = bolt.geometry.getAttribute('position');
    expect(bolt.visible).toBe(true);
    for (let i = 0; i < bolt.geometry.drawRange.count; i++) expect(positions.getY(i)).toBeGreaterThanOrEqual(120);
  });
});
