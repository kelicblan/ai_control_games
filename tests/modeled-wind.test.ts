import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, MeshStandardMaterial, ShaderLib, Vector2 } from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { createModelWind } from '../packages/world-three/src/modelWind';

describe('wind on generated plant models', () => {
  it('updates visible and shadow materials with the same wind without changing model geometry', () => {
    const wind = createModelWind(), group = new Group(), mesh = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 1);
    group.add(mesh); const original = Array.from(mesh.geometry.attributes.position.array);
    wind.apply(group);
    const compile = (material: MeshStandardMaterial) => {
      const shader = { ...ShaderLib.standard, uniforms: { ...ShaderLib.standard.uniforms } };
      material.onBeforeCompile(shader as WebGLProgramParametersWithUniforms, {} as WebGLRenderer); return shader;
    };
    const shader = compile(mesh.material as MeshStandardMaterial);
    const shadow = compile(mesh.customDepthMaterial as MeshStandardMaterial);
    wind.update(12, .8, Math.PI / 2, false);
    expect(shader.uniforms.modelWindTime.value).toBe(12);
    expect((shader.uniforms.modelWind.value as Vector2).y).toBeCloseTo(.8);
    expect(shadow.uniforms.modelWind).toBe(shader.uniforms.modelWind);
    wind.update(13, .8, 0, true);
    expect((shader.uniforms.modelWind.value as Vector2).length()).toBe(0);
    expect(Array.from(mesh.geometry.attributes.position.array)).toEqual(original);
    wind.dispose();
  });
});
