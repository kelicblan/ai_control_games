import { MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, RGBADepthPacking, Vector2 } from 'three';
import type { Material } from 'three';
import type { Atmosphere } from '../game/types';

/** Normalized tip deflection. Atmosphere already contains the weather's gusts. */
export function treeWindPressure(windStrength: number): number {
  const strength = Math.max(0, Math.min(1, windStrength));
  return .22 * strength * (.3 + .7 * strength);
}

const deformation = /* glsl */`
  attribute vec4 windRoot;
  uniform float uTreeTime;
  uniform vec2 uTreeVector;
  uniform float uTreeMotion;

  void deformRootedTree(vec3 point, out vec3 bent, out mat3 jacobian) {
    float height = max(1.0, windRoot.z);
    float t = max(point.y, 0.0) / height;
    float t2 = t * t;
    float t3 = t2 * t;
    vec2 radial = point.xz - windRoot.xy;

    // Each tree recoils around the supplied wind load, with a slower response
    // for tall trunks. These local elastic modes do not create a second gust.
    float phase = windRoot.w;
    float rate = 1.05 * sqrt(20.0 / height) * (0.93 + 0.07 * sin(phase * 1.71));
    vec2 across = vec2(-uTreeVector.y, uTreeVector.x);
    vec2 load = uTreeVector * (1.0 + 0.20 * uTreeMotion * sin(uTreeTime * rate + phase))
      + across * (0.10 * uTreeMotion * sin(uTreeTime * rate * 0.83 + phase * 1.6));
    vec2 crown = uTreeMotion * (
      uTreeVector * 0.045 * sin(uTreeTime * rate * 2.65 + phase * 2.3)
      + across * 0.055 * sin(uTreeTime * rate * 2.18 + phase * 0.73)
    );

    // Cantilever shape 1.5t² - 0.5t³, plus a small upper-crown mode.
    // No constant or linear term: the entire root plane stays fixed and
    // upright, while each higher cross-section has its own position and tilt.
    vec2 quadratic = load * 1.5;
    vec2 cubic = -load * 0.5 + crown;
    vec2 bend = quadratic * t2 + cubic * t3;
    vec2 slope = quadratic * (2.0 * t) + cubic * (3.0 * t2);
    vec2 curvature = quadratic * 2.0 + cubic * (6.0 * t);

    // Second-order arc-length correction prevents the trunk stretching upward
    // as it bends. The radial term inclines branches with the local trunk.
    float drop = (2.0 / 3.0) * dot(quadratic, quadratic) * t3
      + 1.5 * dot(quadratic, cubic) * t3 * t
      + 0.9 * dot(cubic, cubic) * t3 * t2;
    bent = vec3(point.x + height * bend.x,
      point.y - height * drop - dot(radial, slope),
      point.z + height * bend.y);

    // Exact differential of the displayed deformation, including crown tilt.
    // Cofactors below transform normals by the inverse transpose without an
    // inverse per vertex. Buried root vertices keep their original normals.
    float aboveGround = step(0.00001, point.y);
    float verticalSlope = 1.0 - aboveGround * (
      0.5 * dot(slope, slope) + dot(radial, curvature) / height
    );
    jacobian = mat3(
      vec3(1.0, -slope.x, 0.0),
      vec3(slope.x, verticalSlope, slope.y),
      vec3(0.0, -slope.y, 1.0)
    );
  }
`;

/** Each merged pine retains its root and height; its trunk, crown and shadow bend together. */
export class RootedWind {
  private uniforms = {
    uTreeTime: { value: 0 },
    uTreeVector: { value: new Vector2() },
    uTreeMotion: { value: 1 },
  };
  readonly depth = this.patch(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }));
  readonly distance = this.patch(new MeshDistanceMaterial());

  material(source: MeshStandardMaterial): MeshStandardMaterial { return this.patch(source.clone()); }

  update(time: number, atmosphere: Atmosphere, reducedMotion: boolean) {
    this.uniforms.uTreeTime.value = time;
    this.uniforms.uTreeMotion.value = reducedMotion ? 0 : 1;
    this.uniforms.uTreeVector.value.set(Math.cos(atmosphere.windAngle), Math.sin(atmosphere.windAngle))
      .multiplyScalar(treeWindPressure(atmosphere.windStrength));
  }

  private patch<T extends Material>(mat: T): T {
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${deformation}`)
        .replace('void main() {', `void main() {
          vec3 treePosition;
          mat3 treeJacobian;
          deformRootedTree(position, treePosition, treeJacobian);
        `)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          objectNormal = normalize(mat3(
            cross(treeJacobian[1], treeJacobian[2]),
            cross(treeJacobian[2], treeJacobian[0]),
            cross(treeJacobian[0], treeJacobian[1])
          ) * objectNormal);
          #ifdef USE_TANGENT
            objectTangent = normalize(treeJacobian * objectTangent);
          #endif
        `)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = treePosition;');
    };
    mat.customProgramCacheKey = () => 'campmind-rooted-wind-v2';
    return mat;
  }
}
