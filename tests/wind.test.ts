import { describe, expect, it } from 'vitest';
import { MeshDistanceMaterial, MeshStandardMaterial, ShaderLib } from 'three';
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import type { Atmosphere } from '../src/games/camp/simulation/types';
import { RootedWind, treeWindPressure } from '../src/scene/wind';

const atmosphere = (strength = 1, angle = 0): Atmosphere => ({
  windStrength: strength, windAngle: angle, rainIntensity: 0, cloudCover: 0, stormRisk: 0,
  lightningAt: -1, lightningPoint: null, nextLightningAt: 100, revision: 0,
});

function compiledUniforms(material: Material, source: keyof typeof ShaderLib = 'standard') {
  const shader = { ...ShaderLib[source], uniforms: { ...ShaderLib[source].uniforms } };
  material.onBeforeCompile(shader as WebGLProgramParametersWithUniforms, {} as WebGLRenderer);
  return shader.uniforms;
}

describe('rooted tree wind', () => {
  it('keeps wind pressure bounded and makes strong wind visibly load the crown', () => {
    expect(treeWindPressure(0)).toBe(0);
    expect(treeWindPressure(-1)).toBe(0);
    expect(treeWindPressure(2)).toBe(treeWindPressure(1));
    expect(treeWindPressure(1)).toBeGreaterThan(.15);
    expect(treeWindPressure(1)).toBeLessThan(.3);
    expect(treeWindPressure(.75)).toBeGreaterThan(treeWindPressure(.25) * 3);
  });

  it('uses east and south as the wind destination and shares the supplied simulation time', () => {
    const wind = new RootedWind();
    const uniforms = compiledUniforms(wind.depth, 'depth');
    wind.update(17, atmosphere(.8, 0), false);
    expect(uniforms.uTreeVector.value.x).toBeCloseTo(treeWindPressure(.8));
    expect(uniforms.uTreeVector.value.y).toBeCloseTo(0);
    expect(uniforms.uTreeTime.value).toBe(17);

    wind.update(18, atmosphere(.8, Math.PI / 2), false);
    expect(uniforms.uTreeVector.value.x).toBeCloseTo(0);
    expect(uniforms.uTreeVector.value.y).toBeCloseTo(treeWindPressure(.8));
    expect(uniforms.uTreeTime.value).toBe(18);
  });

  it('retains steady wind pressure while reduced motion removes elastic oscillation', () => {
    const wind = new RootedWind();
    const uniforms = compiledUniforms(wind.depth, 'depth');
    wind.update(2, atmosphere(.9, .7), false);
    const pressure = uniforms.uTreeVector.value.clone();
    expect(uniforms.uTreeMotion.value).toBe(1);
    wind.update(62, atmosphere(.9, .7), true);
    expect(uniforms.uTreeMotion.value).toBe(0);
    expect(uniforms.uTreeVector.value.equals(pressure)).toBe(true);
    expect(uniforms.uTreeVector.value.length()).toBeGreaterThan(0);
  });

  it('keeps lit surfaces, directional shadows and point light shadows on the same uniforms', () => {
    const wind = new RootedWind();
    expect(wind.distance).toBeInstanceOf(MeshDistanceMaterial);
    const source = new MeshStandardMaterial();
    const color = compiledUniforms(wind.material(source));
    const depth = compiledUniforms(wind.depth, 'depth');
    const distance = compiledUniforms(wind.distance, 'distance');
    for (const name of ['uTreeTime', 'uTreeVector', 'uTreeMotion']) {
      expect(color[name]).toBe(depth[name]);
      expect(color[name]).toBe(distance[name]);
    }
    wind.update(23, atmosphere(), false);
    expect(distance.uTreeTime.value).toBe(23);
    expect(depth.uTreeVector.value.length()).toBeCloseTo(treeWindPressure(1));
  });
});
