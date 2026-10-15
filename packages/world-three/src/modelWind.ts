import { Mesh, MeshDepthMaterial, MeshDistanceMaterial, RGBADepthPacking, Vector2 } from 'three';
import type { Group, Material } from 'three';

/** Normalized plant templates bend above their roots, on the GPU. Shared
 * uniforms also animate their shadow silhouettes without touching CPU vertices. */
export function createModelWind() {
  const time = { value: 0 }, wind = { value: new Vector2() }, patched = new Set<Material>();
  function patch(material: Material) {
    if (patched.has(material)) return; patched.add(material);
    const before = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      before.call(material, shader, renderer);
      shader.uniforms.modelWindTime = time; shader.uniforms.modelWind = wind;
      shader.vertexShader = 'uniform float modelWindTime; uniform vec2 modelWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float rootWeight=pow(clamp(position.y,0.0,1.0),2.0);
          float sway=sin(modelWindTime*1.9+instanceMatrix[3].x*.12+instanceMatrix[3].z*.09);
          transformed.xz+=modelWind*rootWeight*(sway*.035+sin(modelWindTime*3.7+position.y*11.0)*.009);
        #endif`);
    };
    material.customProgramCacheKey = () => `${key}|modeled-plant-wind-v1`;
    material.needsUpdate = true;
  }
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking }), distance = new MeshDistanceMaterial();
  patch(depth); patch(distance);
  return {
    apply(group: Group) {
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) patch(material);
        object.customDepthMaterial = depth; object.customDistanceMaterial = distance;
      });
    },
    update(seconds: number, strength: number, angle: number, reducedMotion: boolean) {
      time.value = seconds; wind.value.set(Math.cos(angle), Math.sin(angle)).multiplyScalar(reducedMotion ? 0 : strength);
    },
    dispose() { depth.dispose(); distance.dispose(); patched.clear(); },
  };
}
