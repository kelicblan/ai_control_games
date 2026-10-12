import {
  Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Mesh,
  MeshStandardMaterial, Object3D, PlaneGeometry, ShaderMaterial, Vector2,
} from 'three';
import type { Atmosphere } from '../game/types';
import { seeded } from './geometry';

interface RiverBounds { centerX: number; centerZ: number; halfWidth: number; halfLength: number }
const BANK_SPEED = .52, CHANNEL_SPEED = 1.85;
const FOAM_COUNT = 144;

/** The current always travels south (+world Z); bank friction slows its outer lanes. */
function currentSpeed(x: number, halfWidth: number) {
  const bank = Math.min(1, Math.abs(x) / halfWidth);
  return BANK_SPEED + (CHANNEL_SPEED - BANK_SPEED) * (1 - bank * bank);
}

const riverShader = `
  uniform float uRiverTime;
  uniform float uRiverRain;
  uniform float uRiverWind;
  uniform float uRiverHalfWidth;
  uniform float uRiverBankSpeed;
  uniform float uRiverChannelSpeed;
  uniform vec2 uRiverWindVector;
  varying vec2 vRiverXZ;
  float riverSpeed(float x) {
    float bank = clamp(abs(x) / uRiverHalfWidth, 0.0, 1.0);
    return mix(uRiverBankSpeed, uRiverChannelSpeed, 1.0 - bank * bank);
  }
  float riverHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 riverAdvected(vec2 p, float phase) { return vec2(p.x, p.y - riverSpeed(p.x) * phase * 12.0); }
  float riverWave(vec2 p) {
    return sin(p.y * 2.25 + sin(p.x * 1.7) * 0.62) * 0.022
      + sin(p.y * 5.6 + p.x * 2.4) * sin(p.x * 3.3 - p.y * 0.24) * 0.008;
  }
  float riverHeight(vec2 p) {
    float phase = fract(uRiverTime / 12.0);
    // Two fading parcels prevent unlimited texture shear while both move at the current speed.
    float blend = abs(phase * 2.0 - 1.0);
    float current = mix(riverWave(riverAdvected(p, phase)), riverWave(riverAdvected(p, fract(phase + 0.5))), blend);
    float crossRipple = sin(dot(p, uRiverWindVector) * 5.1 - uRiverTime * 2.8) * uRiverWind * 0.008;
    vec2 cell = floor(p * 0.65), local = fract(p * 0.65);
    vec2 drop = vec2(0.22 + riverHash(cell) * 0.56, 0.22 + riverHash(cell + 19.7) * 0.56);
    float age = fract(uRiverTime * 1.3 + riverHash(cell + 4.1));
    float ring = length(local - drop) - age * 0.56;
    float rainfall = sin(ring * 50.0) * exp(-abs(ring) * 19.0) * (1.0 - age) * uRiverRain * 0.012;
    return current + crossRipple + rainfall;
  }
  float riverCrests(vec2 p) {
    float ribbon = sin(p.y * 2.25 + sin(p.x * 1.7) * 0.62);
    float broken = 0.5 + 0.5 * sin(p.x * 4.6 + sin(p.y * 0.8) * 1.2);
    return smoothstep(0.64, 0.98, ribbon) * smoothstep(0.15, 0.82, broken);
  }
`;

/** A lit procedural surface and a fixed foam budget share the same downstream velocity profile. */
export function createRiverSurface(bounds: RiverBounds) {
  const group = new Group(); group.name = 'Continuous downstream creek';
  const random = seeded(38217);
  const uniforms = {
    uRiverTime: { value: 0 }, uRiverRain: { value: 0 }, uRiverWind: { value: 0 },
    uRiverHalfWidth: { value: bounds.halfWidth }, uRiverBankSpeed: { value: BANK_SPEED },
    uRiverChannelSpeed: { value: CHANNEL_SPEED }, uRiverWindVector: { value: new Vector2(1, 0) },
    uRiverDeep: { value: new Color('#3b807f') }, uRiverShallow: { value: new Color('#79aaa0') },
  };
  const clearDeep = new Color('#3b807f'), wetDeep = new Color('#366d78');
  const clearShallow = new Color('#79aaa0'), wetShallow = new Color('#679398');
  const geometry = new PlaneGeometry(bounds.halfWidth * 2, bounds.halfLength * 2, 14, 256);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshStandardMaterial({ color: '#ffffff', roughness: .25, metalness: .16, transparent: true, opacity: .94 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${riverShader}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRiverXZ = position.xz;
        transformed.y += riverHeight(position.xz);
      `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${riverShader}
        uniform vec3 uRiverDeep; uniform vec3 uRiverShallow;
      `).replace('#include <color_fragment>', `#include <color_fragment>
        float riverPhase = fract(uRiverTime / 12.0);
        float riverBlend = abs(riverPhase * 2.0 - 1.0);
        float riverCrest = mix(riverCrests(riverAdvected(vRiverXZ, riverPhase)),
          riverCrests(riverAdvected(vRiverXZ, fract(riverPhase + 0.5))), riverBlend);
        float riverBank = pow(clamp(abs(vRiverXZ.x) / uRiverHalfWidth, 0.0, 1.0), 1.8);
        diffuseColor.rgb *= mix(uRiverDeep, uRiverShallow, riverBank * 0.72);
        diffuseColor.rgb += vec3(0.19, 0.27, 0.23) * riverCrest * (0.68 + uRiverRain * 0.15);
      `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float riverDx = (riverHeight(vRiverXZ + vec2(0.045, 0.0)) - riverHeight(vRiverXZ - vec2(0.045, 0.0))) / 0.09;
        float riverDz = (riverHeight(vRiverXZ + vec2(0.0, 0.045)) - riverHeight(vRiverXZ - vec2(0.0, 0.045))) / 0.09;
        normal = normalize(mat3(viewMatrix) * vec3(-riverDx * 2.0, 1.0, -riverDz * 2.0));
      `);
  };
  material.customProgramCacheKey = () => 'campmind-downstream-water-v1';
  const surface = new Mesh(geometry, material);
  surface.position.set(bounds.centerX, .055, bounds.centerZ); surface.receiveShadow = true;
  surface.name = 'Shared deep creek footprint'; group.add(surface);

  const foamGeometry = new PlaneGeometry(1, 1);
  const variations = new Float32Array(FOAM_COUNT);
  const foamSeeds = Array.from({ length: FOAM_COUNT }, (_, i) => {
    const x = (((i * 53) % FOAM_COUNT + .5) / FOAM_COUNT * 2 - 1) * bounds.halfWidth * .91;
    const z = (i * .61803398875 + random() * .12) % 1;
    variations[i] = random();
    return { x, z, speed: currentSpeed(x, bounds.halfWidth),
      width: Math.min(.4 + random() * .6, (bounds.halfWidth - Math.abs(x)) * 1.6), length: .9 + random() * 1.1 };
  });
  foamGeometry.setAttribute('foamSeed', new InstancedBufferAttribute(variations, 1));
  const foamMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { opacity: { value: .45 } },
    vertexShader: `attribute float foamSeed; varying vec2 vUv; varying float vSeed;
      void main() { vUv = uv; vSeed = foamSeed; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float opacity; varying vec2 vUv; varying float vSeed;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        p.x += sin(p.y * 3.3 + vSeed * 6.28) * 0.11;
        float thread = exp(-pow(p.x * 7.0, 2.0)) * (1.0 - smoothstep(0.26, 1.0, abs(p.y)));
        float side = exp(-pow((p.x - 0.40) * 11.0, 2.0)) * (1.0 - smoothstep(0.18, 0.8, abs(p.y + 0.19)));
        float flecks = exp(-length((p - vec2(-0.37, 0.25)) * vec2(13.0, 9.0))) * 0.72;
        float alpha = (thread + side * 0.65 + flecks) * opacity;
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(0.79, 0.90, 0.83, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const foam = new InstancedMesh(foamGeometry, foamMaterial, FOAM_COUNT);
  foam.instanceMatrix.setUsage(DynamicDrawUsage); foam.frustumCulled = false;
  foam.name = 'Flowing creek ripples'; group.add(foam);
  const pose = new Object3D();

  return {
    group,
    update(time: number, atmosphere: Atmosphere, reducedMotion: boolean) {
      const visualTime = reducedMotion ? 0 : time;
      uniforms.uRiverTime.value = visualTime;
      uniforms.uRiverRain.value = atmosphere.rainIntensity;
      uniforms.uRiverWind.value = atmosphere.windStrength;
      uniforms.uRiverWindVector.value.set(Math.cos(atmosphere.windAngle), Math.sin(atmosphere.windAngle));
      uniforms.uRiverDeep.value.copy(clearDeep).lerp(wetDeep, atmosphere.rainIntensity * .7);
      uniforms.uRiverShallow.value.copy(clearShallow).lerp(wetShallow, atmosphere.rainIntensity * .7);
      material.roughness = .25 + atmosphere.rainIntensity * .1;
      foamMaterial.uniforms.opacity.value = .45 + atmosphere.rainIntensity * .1;
      const length = bounds.halfLength * 2;
      for (let i = 0; i < foamSeeds.length; i++) {
        const seed = foamSeeds[i];
        const distance = ((seed.z * length + visualTime * seed.speed) % length + length) % length;
        pose.position.set(bounds.centerX + seed.x, .126, bounds.centerZ - bounds.halfLength + distance);
        pose.rotation.set(-Math.PI / 2, 0, 0); pose.scale.set(seed.width, seed.length, 1);
        pose.updateMatrix(); foam.setMatrixAt(i, pose.matrix);
      }
      foam.instanceMatrix.needsUpdate = true;
    },
  };
}
