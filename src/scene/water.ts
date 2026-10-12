import {
  Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Mesh,
  MeshStandardMaterial, Object3D, PlaneGeometry, ShaderMaterial, Vector2, Vector4,
} from 'three';
import type { Atmosphere } from '../game/types';
import { seeded } from './geometry';

interface RiverBounds { centerX: number; centerZ: number; halfWidth: number; halfLength: number }
const BANK_SPEED = .52, CHANNEL_SPEED = 1.85;
const FOAM_COUNT = 224;

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
  float riverNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(riverHash(cell), riverHash(cell + vec2(1.0, 0.0)), f.x),
      mix(riverHash(cell + vec2(0.0, 1.0)), riverHash(cell + 1.0), f.x), f.y);
  }
  vec2 riverAdvected(vec2 p, float phase) {
    float bank = pow(clamp(abs(p.x) / uRiverHalfWidth, 0.0, 1.0), 3.0);
    p.y -= riverSpeed(p.x) * phase * 10.0;
    p.x += sin(p.y * 0.72 + p.x * 1.7) * (0.07 + bank * 0.28);
    return p;
  }
  float riverWave(vec2 p) {
    float warp = sin(p.x * 1.25 + p.y * 0.38) + sin(p.y * 1.12 - p.x * 0.71) * 0.45;
    return sin(p.y * 1.68 + p.x * 1.12 + warp * 1.55) * 0.016
      + sin(p.y * 4.2 - p.x * 2.7 + warp * 1.9) * sin(p.y * 0.84 + p.x * 2.1) * 0.007
      + sin(p.y * 10.8 + p.x * 7.6 + warp * 2.3) * 0.0026;
  }
  float riverRainRing(vec2 p, float offset) {
    vec2 cell = floor(p), local = fract(p);
    vec2 drop = vec2(0.2 + riverHash(cell + offset) * 0.6, 0.2 + riverHash(cell + offset + 19.7) * 0.6);
    float age = fract(uRiverTime * (1.45 + offset * 0.015) + riverHash(cell + offset + 4.1));
    float ring = length(local - drop) - age * 0.48;
    return sin(ring * 72.0) * exp(-abs(ring) * 24.0) * (1.0 - age) * smoothstep(0.0, 0.1, age);
  }
  float riverHeight(vec2 p) {
    float phase = fract(uRiverTime / 10.0), blend = abs(phase * 2.0 - 1.0);
    // Fading between parcels bounds shear without ever reversing the downstream current.
    float current = mix(riverWave(riverAdvected(p, phase)), riverWave(riverAdvected(p, fract(phase + 0.5))), blend);
    float crossRipple = sin(dot(p, uRiverWindVector) * 7.2 - uRiverTime * 3.1 + sin(p.y * 1.7)) * uRiverWind * 0.004;
    float rainfall = 0.0;
    if (uRiverRain > 0.001) rainfall = riverRainRing(p * 0.9, 0.0) + riverRainRing(p * 1.38 + 5.2, 13.0) * 0.55;
    return current + crossRipple + rainfall * uRiverRain * 0.007;
  }
  float riverFilaments(vec2 p) {
    p.x += sin(p.y * 0.8 + p.x * 0.6) * 0.25 + sin(p.y * 2.1) * 0.07;
    float ridge = abs(sin(p.x * 6.9 + p.y * 2.2 + sin(p.y * 1.2 + p.x * 0.8) * 2.4));
    float broken = smoothstep(0.57, 0.82, riverNoise(p * vec2(2.9, 1.65) + 9.5));
    return (1.0 - smoothstep(0.04, 0.21, ridge)) * broken;
  }
`;

/** One lit water draw and a fixed foam budget; every layer shares the same creek footprint. */
export function createRiverSurface(bounds: RiverBounds) {
  const group = new Group(); group.name = 'Continuous downstream creek';
  const random = seeded(38217);
  const clearDeep = new Color('#254b55'), wetDeep = new Color('#263f4b');
  const clearShallow = new Color('#687e70'), wetShallow = new Color('#526d69');
  const clearSky = new Color('#9db1ad'), wetSky = new Color('#879ca4');
  const uniforms = {
    uRiverTime: { value: 0 }, uRiverRain: { value: 0 }, uRiverWind: { value: 0 },
    uRiverHalfWidth: { value: bounds.halfWidth }, uRiverBankSpeed: { value: BANK_SPEED },
    uRiverChannelSpeed: { value: CHANNEL_SPEED }, uRiverWindVector: { value: new Vector2(1, 0) },
    uRiverDeep: { value: clearDeep.clone() }, uRiverShallow: { value: clearShallow.clone() },
    uRiverSky: { value: clearSky.clone() },
  };
  const geometry = new PlaneGeometry(bounds.halfWidth * 2, bounds.halfLength * 2, 14, 256);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshStandardMaterial({ color: '#ffffff', roughness: .24, metalness: .035, transparent: true, opacity: .97 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${riverShader}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRiverXZ = position.xz;
        transformed.y += riverHeight(position.xz);
      `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${riverShader}
        uniform vec3 uRiverDeep; uniform vec3 uRiverShallow; uniform vec3 uRiverSky;
      `).replace('#include <color_fragment>', `#include <color_fragment>
        float riverPhase = fract(uRiverTime / 10.0), riverBlend = abs(riverPhase * 2.0 - 1.0);
        float riverThreads = mix(riverFilaments(riverAdvected(vRiverXZ, riverPhase)),
          riverFilaments(riverAdvected(vRiverXZ, fract(riverPhase + 0.5))), riverBlend);
        float riverBank = clamp(abs(vRiverXZ.x) / uRiverHalfWidth, 0.0, 1.0);
        float riverBed = riverNoise(vRiverXZ * vec2(0.86, 0.48)) * 0.65
          + riverNoise(vRiverXZ * 3.2 + 17.0) * 0.35;
        float riverShallows = pow(riverBank, 2.1) * (0.45 + riverBed * 0.46);
        diffuseColor.rgb *= mix(uRiverDeep * (0.79 + riverBed * 0.32), uRiverShallow, riverShallows);
        diffuseColor.rgb = mix(diffuseColor.rgb, uRiverShallow * 1.5, riverThreads * (0.18 + riverBank * 0.1));
        diffuseColor.a *= mix(1.0, 0.76, smoothstep(0.62, 1.0, riverBank));
      `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float riverDx = (riverHeight(vRiverXZ + vec2(0.035, 0.0)) - riverHeight(vRiverXZ - vec2(0.035, 0.0))) / 0.07;
        float riverDz = (riverHeight(vRiverXZ + vec2(0.0, 0.035)) - riverHeight(vRiverXZ - vec2(0.0, 0.035))) / 0.07;
        vec3 riverNormal = normalize(vec3(-riverDx * 1.55, 1.0, -riverDz * 1.55));
        normal = normalize(mat3(viewMatrix) * riverNormal);
      `).replace('#include <opaque_fragment>', `
        vec3 riverView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
        float riverFresnel = 0.035 + 0.965 * pow(1.0 - max(dot(normal, riverView), 0.0), 5.0);
        vec3 riverReflected = reflect(inverseTransformDirection(-riverView, viewMatrix), riverNormal);
        float riverSkyWindow = smoothstep(0.05, 0.75, riverReflected.y);
        float riverSkyBreak = riverNoise(vRiverXZ * vec2(0.31, 0.13) + riverNormal.xz * 3.2);
        vec3 riverReflection = mix(uRiverDeep * 0.62, uRiverSky * (0.72 + riverSkyBreak * 0.28), riverSkyWindow);
        outgoingLight = mix(outgoingLight, riverReflection, min(0.42, riverFresnel * 0.8 + 0.045));
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'campmind-downstream-water-v2';
  const surface = new Mesh(geometry, material);
  surface.position.set(bounds.centerX, .055, bounds.centerZ); surface.receiveShadow = true;
  surface.name = 'Shared deep creek footprint'; group.add(surface);

  const foamGeometry = new PlaneGeometry(1, 1);
  const variations = new Float32Array(FOAM_COUNT);
  const foamSeeds = Array.from({ length: FOAM_COUNT }, (_, i) => {
    const x = (((i * 97) % FOAM_COUNT + .5) / FOAM_COUNT * 2 - 1) * bounds.halfWidth * .89;
    const z = (i * .61803398875 + random() * .2) % 1;
    variations[i] = random();
    return { x, z, phase: random() * Math.PI * 2, speed: currentSpeed(x, bounds.halfWidth),
      bank: Math.pow(Math.abs(x) / bounds.halfWidth, 2), width: .25 + random() * .55, length: .42 + random() * 1.24 };
  });
  foamGeometry.setAttribute('foamSeed', new InstancedBufferAttribute(variations, 1));
  const foamMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { opacity: { value: .43 }, uFoamTime: uniforms.uRiverTime,
      uFoamBounds: { value: new Vector4(bounds.centerX, bounds.centerZ, bounds.halfWidth, bounds.halfLength) } },
    vertexShader: `attribute float foamSeed; varying vec2 vUv; varying float vSeed; varying vec2 vFoamXZ; varying float vDepth;
      void main() {
        vUv = uv; vSeed = foamSeed;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0); vFoamXZ = world.xz;
        vec4 view = viewMatrix * world; vDepth = -view.z; gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `uniform float opacity; uniform float uFoamTime; uniform vec4 uFoamBounds;
      varying vec2 vUv; varying float vSeed; varying vec2 vFoamXZ; varying float vDepth;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float phase = vSeed * 6.283 + uFoamTime * 0.34;
        float bend = sin(p.y * 2.6 + phase) * 0.22 + sin(p.y * 5.8 + vSeed * 19.0) * 0.065;
        float width = 0.035 + vSeed * 0.025;
        float aa = max(fwidth(p.x) * 0.72, 0.018);
        float thread = 1.0 - smoothstep(width, width + aa, abs(p.x - bend));
        float breaks = smoothstep(-0.4, 0.24, sin(p.y * (9.0 + vSeed * 8.0) + phase));
        float taper = 1.0 - smoothstep(0.26, 0.98, abs(p.y));
        float arcDistance = abs(length((p - vec2(-0.08, -0.2)) * vec2(1.2, 0.78)) - 0.57);
        float arc = (1.0 - smoothstep(0.028, 0.028 + aa, arcDistance)) * smoothstep(-0.4, 0.2, p.y)
          * (1.0 - smoothstep(0.35, 0.75, p.x));
        float flecks = exp(-dot((p - vec2(0.36, 0.31)) * vec2(19.0, 14.0), (p - vec2(0.36, 0.31)) * vec2(19.0, 14.0)));
        float pattern = vSeed < 0.38 ? arc * 0.72 + thread * 0.24 : thread * breaks * taper;
        vec2 edge = abs(vFoamXZ - uFoamBounds.xy);
        float coverage = (1.0 - smoothstep(uFoamBounds.z - 0.13, uFoamBounds.z, edge.x))
          * (1.0 - smoothstep(uFoamBounds.w - 1.0, uFoamBounds.w, edge.y));
        float fade = 1.0 - smoothstep(190.0, 340.0, vDepth);
        float alpha = (pattern + flecks * 0.55) * opacity * coverage * fade * (0.68 + 0.32 * sin(phase * 1.7));
        if (alpha < 0.009) discard;
        gl_FragColor = vec4(0.57, 0.65, 0.60, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const foam = new InstancedMesh(foamGeometry, foamMaterial, FOAM_COUNT);
  foam.instanceMatrix.setUsage(DynamicDrawUsage); foam.frustumCulled = false;
  foam.renderOrder = 2;
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
      uniforms.uRiverSky.value.copy(clearSky).lerp(wetSky, atmosphere.cloudCover);
      material.roughness = .24 + atmosphere.rainIntensity * .1;
      foamMaterial.uniforms.opacity.value = .43 + atmosphere.rainIntensity * .09;
      const length = bounds.halfLength * 2;
      for (let i = 0; i < foamSeeds.length; i++) {
        const seed = foamSeeds[i];
        const eddy = Math.sin(visualTime * .53 + seed.phase);
        const distance = ((seed.z * length + visualTime * seed.speed + eddy * seed.bank * .16) % length + length) % length;
        const x = seed.x + eddy * (.025 + seed.bank * .12);
        pose.position.set(bounds.centerX + x, .114, bounds.centerZ - bounds.halfLength + distance);
        pose.rotation.set(-Math.PI / 2, 0, Math.sin(seed.phase) * .5 + eddy * seed.bank * .56);
        pose.scale.set(seed.width, seed.length * (1 + Math.sin(visualTime * .38 + seed.phase) * .12), 1);
        pose.updateMatrix(); foam.setMatrixAt(i, pose.matrix);
      }
      foam.instanceMatrix.needsUpdate = true;
    },
  };
}
