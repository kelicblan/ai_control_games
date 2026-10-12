import { MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, Vector2 } from 'three';
import type { Material } from 'three';
import type { Atmosphere } from '../game/types';

/** Each merged pine retains its root and height; its trunk, crown and shadow bend together. */
export class RootedWind {
  private uniforms = {
    uTreeTime: { value: 0 },
    uTreeVector: { value: new Vector2() },
    uTreeMotion: { value: 1 },
  };
  readonly depth = this.patch(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }));

  material(source: MeshStandardMaterial): MeshStandardMaterial { return this.patch(source.clone()); }

  update(time: number, atmosphere: Atmosphere, reducedMotion: boolean) {
    this.uniforms.uTreeTime.value = time;
    this.uniforms.uTreeMotion.value = reducedMotion ? 0 : 1;
    this.uniforms.uTreeVector.value.set(Math.cos(atmosphere.windAngle), Math.sin(atmosphere.windAngle)).multiplyScalar(atmosphere.windStrength);
  }

  private patch<T extends Material>(mat: T): T {
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        attribute vec4 windRoot;
        uniform float uTreeTime;
        uniform vec2 uTreeVector;
        uniform float uTreeMotion;
      `).replace('#include <begin_vertex>', `#include <begin_vertex>
        float treeHeight = clamp(position.y / max(1.0, windRoot.z), 0.0, 1.15);
        float treeGust = mix(1.0, 0.80 + 0.20 * sin(uTreeTime * 1.75 + windRoot.w), uTreeMotion);
        float treeBend = treeHeight * treeHeight * (0.35 + windRoot.z * 0.085) * treeGust;
        float tipFlutter = sin(uTreeTime * 4.1 + windRoot.w + position.y * 0.9)
          * treeHeight * 0.13 * uTreeMotion;
        transformed.xz += uTreeVector * treeBend
          + vec2(-uTreeVector.y, uTreeVector.x) * tipFlutter;
      `);
    };
    mat.customProgramCacheKey = () => 'campmind-rooted-wind-v1';
    return mat;
  }
}
