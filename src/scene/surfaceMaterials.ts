import { MeshStandardMaterial } from 'three';
import type { MeshStandardMaterialParameters } from 'three';

export type NaturalSurface = 'earth' | 'bark' | 'wood' | 'stone' | 'canvas';

const surfaceIds: Record<NaturalSurface, number> = { earth: 0, bark: 1, wood: 2, stone: 3, canvas: 4 };

const surfaceFunctions = /* glsl */`
  varying vec3 vSurfacePosition;
  varying vec3 vSurfaceNormal;
  uniform float uSurfaceWetness;

  float surfaceHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float surfaceNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(surfaceHash(cell), surfaceHash(cell + vec2(1, 0)), f.x),
      mix(surfaceHash(cell + vec2(0, 1)), surfaceHash(cell + vec2(1)), f.x), f.y);
  }
  // Derivative filtering fades sub-pixel grains and fabric threads before they alias.
  float surfaceDetailVisibility(vec2 p, float frequency) {
    return 1.0 - smoothstep(.35, 1.1, length(fwidth(p)) * frequency);
  }
  vec2 surfaceWoodCoordinates(vec3 p) {
    #if NATURAL_SURFACE == 1
      return vec2(p.x + p.z * .73, p.y * .22);
    #else
      return vec2(p.y + p.z * .64, p.x * .13);
    #endif
  }
  // Combining three planes prevents the mineral grain stretching into vertical stripes.
  float surfaceStoneNoise(vec3 p) {
    return surfaceNoise(p.xz) * .43 + surfaceNoise(p.xy + vec2(7.1, 11.3)) * .31
      + surfaceNoise(p.yz + vec2(19.4, 3.2)) * .26;
  }
  // Relief itself contains no screen derivatives. Filter its two first-order
  // gradients afterwards; differentiating fwidth() would be undefined in GLSL.
  vec2 surfaceRelief(vec3 p) {
    #if NATURAL_SURFACE == 0
      return vec2(surfaceNoise(p.xz * 4.8) * .035, surfaceNoise(p.xz * 13.0) * .012);
    #elif NATURAL_SURFACE == 1 || NATURAL_SURFACE == 2
      vec2 wood = surfaceWoodCoordinates(p);
      float wobble = surfaceNoise(wood * vec2(2.0, .7)) * 1.2;
      return vec2(surfaceNoise(wood * vec2(19.0, 2.4) + wobble) * .038,
        surfaceNoise(wood * vec2(47.0, 6.0)) * .009);
    #elif NATURAL_SURFACE == 3
      return vec2(surfaceStoneNoise(p * 2.3) * .047, surfaceStoneNoise(p * 8.7) * .017);
    #else
      vec2 cloth = vec2(p.x, p.z + p.y * .7);
      return vec2(sin(cloth.x * 87.0), sin(cloth.y * 92.0)) * .00065;
    #endif
  }
  vec2 surfaceReliefVisibility(vec3 p) {
    #if NATURAL_SURFACE == 0
      return vec2(surfaceDetailVisibility(p.xz, 4.8), surfaceDetailVisibility(p.xz, 13.0));
    #elif NATURAL_SURFACE == 1 || NATURAL_SURFACE == 2
      vec2 wood = surfaceWoodCoordinates(p);
      return vec2(surfaceDetailVisibility(wood, 19.0), surfaceDetailVisibility(wood, 47.0));
    #elif NATURAL_SURFACE == 3
      float footprint = length(fwidth(p));
      return 1.0 - smoothstep(vec2(.35), vec2(1.1), footprint * vec2(2.3, 8.7));
    #else
      vec2 cloth = vec2(p.x, p.z + p.y * .7);
      return vec2(surfaceDetailVisibility(cloth, 18.0));
    #endif
  }
  vec3 surfaceColor(vec3 p, vec3 base, vec3 up) {
    #if NATURAL_SURFACE == 0
      float soilVariation = surfaceNoise(p.xz * .32);
      float grit = surfaceNoise(p.xz * 5.2);
      float fine = surfaceNoise(p.xz * 19.0);
      float detail = surfaceDetailVisibility(p.xz, 7.0);
      base *= .80 + soilVariation * .31 + (grit - .5) * .23 + (fine - .5) * .13 * detail;
      // Pale tiny grit is distributed within the soil, without a repeated tile or decal edge.
      float specks = smoothstep(.83, .94, fine) * detail;
      base = mix(base, vec3(.39, .34, .23), specks * .32);
    #elif NATURAL_SURFACE == 1 || NATURAL_SURFACE == 2
      vec2 wood = surfaceWoodCoordinates(p);
      float broad = surfaceNoise(wood * vec2(3.6, 1.1));
      float grain = surfaceNoise(wood * vec2(22.0, 3.5) + broad);
      float furrow = smoothstep(.62, .84, grain);
      base *= .79 + broad * .38 - furrow * .25;
      base += vec3(.045, .030, .014) * smoothstep(.68, .91, broad);
    #elif NATURAL_SURFACE == 3
      float broad = surfaceStoneNoise(p * .65);
      float grain = surfaceStoneNoise(p * 9.0);
      float fracture = 1.0 - smoothstep(.012, .065,
        abs(surfaceStoneNoise(p * 2.1) - .48));
      base *= .79 + broad * .36 + (grain - .5) * .32 - fracture * .10;
      float moss = smoothstep(.30, .73, up.y) * smoothstep(.43, .76,
        surfaceNoise(p.xz * .72 + p.y * .13) + (grain - .5) * .28);
      base = mix(base, vec3(.105, .155, .043) * (.82 + grain * .35), moss * .70);
      float lichen = smoothstep(.66, .77, surfaceStoneNoise(p * 3.9));
      base = mix(base, vec3(.40, .37, .23), lichen * .24);
    #else
      vec2 cloth = vec2(p.x, p.z + p.y * .7);
      float mottling = surfaceNoise(cloth * 2.1);
      float weave = sin(cloth.x * 87.0) * sin(cloth.y * 92.0)
        * surfaceDetailVisibility(cloth, 18.0);
      base *= .92 + mottling * .10 + weave * .035;
    #endif
    return base * (1.0 - uSurfaceWetness * .12);
  }
  vec3 surfacePerturbNormal(vec3 positionView, vec3 n, vec2 relief, vec2 visibility, float side) {
    vec3 dx = normalize(dFdx(positionView)), dy = normalize(dFdy(positionView));
    vec3 acrossX = cross(dy, n), acrossY = cross(n, dx);
    float determinant = dot(dx, acrossX) * side;
    vec2 slopes = vec2(dot(dFdx(relief), visibility), dot(dFdy(relief), visibility));
    vec3 gradient = sign(determinant) * (slopes.x * acrossX + slopes.y * acrossY);
    return normalize(abs(determinant) * n - gradient);
  }
`;

/** Composes with rooted wind rather than replacing its vertex deformation. No image downloads or textures. */
export function detailNaturalMaterial(target: MeshStandardMaterial, kind: NaturalSurface): MeshStandardMaterial {
  const previousCompile = target.onBeforeCompile.bind(target);
  const previousKey = target.customProgramCacheKey();
  const wetness = { value: 0 };
  target.userData.naturalWetness = wetness;
  target.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    shader.uniforms.uSurfaceWetness = wetness;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSurfacePosition;
        varying vec3 vSurfaceNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vSurfacePosition = position;
        vSurfaceNormal = inverseTransformDirection(transformedNormal, viewMatrix);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define NATURAL_SURFACE ${surfaceIds[kind]}\n${surfaceFunctions}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = surfaceColor(vSurfacePosition, diffuseColor.rgb, normalize(vSurfaceNormal));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = max(.30, roughnessFactor * (1.0 - uSurfaceWetness * .29));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = surfacePerturbNormal(-vViewPosition, normal, surfaceRelief(vSurfacePosition),
          surfaceReliefVisibility(vSurfacePosition), faceDirection);`);
  };
  target.customProgramCacheKey = () => `${previousKey}:natural-${kind}-v1`;
  return target;
}

export function createNaturalMaterial(kind: NaturalSurface, color: string, options: MeshStandardMaterialParameters = {}) {
  return detailNaturalMaterial(new MeshStandardMaterial({ color, roughness: .92, metalness: 0, ...options }), kind);
}

export function setNaturalWetness(material: MeshStandardMaterial, rain: number) {
  const wetness = material.userData.naturalWetness as { value: number } | undefined;
  if (wetness) wetness.value = Math.max(0, Math.min(1, rain));
}
