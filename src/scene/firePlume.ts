import {
  AdditiveBlending, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute,
  Group, NormalBlending, Points, ShaderMaterial, Vector2,
} from 'three';
import type { Atmosphere } from '../games/camp/simulation/types';
import { seeded, TAU } from './geometry';

type PlumeKind = 'smoke' | 'steam' | 'ember';

/** Small, fixed particle pools. Each particle is reconstructed from game time, never integrated. */
export function createFirePlume(x: number, z: number) {
  const group = new Group(); group.name = 'Campfire convection';
  const random = seeded(57391);
  const resolution = new Vector2();
  const makeParticles = (kind: PlumeKind, count: number) => {
    const seeds = Array.from({ length: count }, () => [random(), random(), random()]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('particleAge', new Float32BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage));
    geometry.setAttribute('particleSize', new Float32BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage));
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: kind === 'ember' ? AdditiveBlending : NormalBlending,
      uniforms: {
        opacity: { value: .1 }, pointScale: { value: 600 }, perspective: { value: 0 },
        color: { value: new Color(kind === 'ember' ? '#ffbc60' : kind === 'steam' ? '#dfebe4' : '#a5aaa0') },
        isEmber: { value: kind === 'ember' ? 1 : 0 },
      },
      vertexShader: `attribute float particleAge; attribute float particleSize;
        uniform float pointScale; uniform float perspective; varying float vAge;
        void main() {
          vAge = particleAge;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(particleSize * pointScale * projectionMatrix[1][1] / mix(1.0, max(1.0, -mv.z), perspective), 1.0, 84.0);
        }`,
      fragmentShader: `uniform float opacity; uniform vec3 color; uniform float isEmber; varying float vAge;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float distance = length(p);
          float softness = pow(max(0.0, 1.0 - distance), mix(1.6, 1.0, isEmber));
          float fade = smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.48, 1.0, vAge));
          float alpha = softness * fade * opacity;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const points = new Points(geometry, material); points.frustumCulled = false;
    points.name = kind === 'smoke' ? 'Wind carried campfire smoke' : kind === 'steam' ? 'Rain steam over hot embers' : 'Wind carried fire sparks';
    points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(resolution);
      material.uniforms.pointScale.value = resolution.y * .5;
      material.uniforms.perspective.value = 'isPerspectiveCamera' in camera ? 1 : 0;
    };
    group.add(points);
    return { kind, seeds, points, geometry, material };
  };
  const pools = [makeParticles('smoke', 30), makeParticles('steam', 12), makeParticles('ember', 42)];

  return {
    group,
    update(time: number, fire: number, atmosphere: Atmosphere, reducedMotion: boolean) {
      const strength = Math.max(0, Math.min(1, fire / 100)), heat = Math.sqrt(strength);
      const rain = atmosphere.rainIntensity, wind = atmosphere.windStrength;
      const wx = Math.cos(atmosphere.windAngle), wz = Math.sin(atmosphere.windAngle);
      const visualTime = reducedMotion ? 0 : time;
      for (const pool of pools) {
        const { kind, points, geometry, material, seeds } = pool;
        const isSmoke = kind === 'smoke', isSteam = kind === 'steam';
        points.visible = strength > .005 && (!isSteam || rain > .015);
        geometry.setDrawRange(0, Math.ceil(seeds.length * (isSteam ? heat * rain : heat * (isSmoke ? 1 : 1 - rain * .55))));
        material.uniforms.opacity.value = isSmoke ? heat * (.25 + rain * .04)
          : isSteam ? heat * rain * .33 : heat * (1 - rain * .72) * .94;
        const positions = geometry.getAttribute('position');
        const ages = geometry.getAttribute('particleAge'), sizes = geometry.getAttribute('particleSize');
        for (let i = 0; i < seeds.length; i++) {
          const [a, b, c] = seeds[i];
          const rate = isSmoke ? .115 + a * .025 : isSteam ? .21 + a * .025 : .25 + a * .045;
          const age = ((b + visualTime * rate) % 1 + 1) % 1;
          const lift = isSmoke ? 2 + heat * (7.5 - rain * 1.1) : isSteam ? .8 + heat * 3.5 : 1 + heat * (7 - rain * 2);
          // Buoyancy dominates near the logs; wind displacement grows with flight age.
          const downwind = wind * age * age * (isSmoke ? 12.5 : isSteam ? 5.5 : 10) * (.4 + heat * .6);
          const curl = Math.sin(a * TAU + age * (isSmoke ? 7 : 4)) * age * (isSmoke ? .65 : .28);
          const spread = (isSteam ? .9 : .48) + age * (isSmoke ? .35 : .15);
          positions.setXYZ(i, x + Math.cos(a * TAU) * spread + wx * downwind - wz * curl,
            .45 + age * lift, z + Math.sin(a * TAU) * spread + wz * downwind + wx * curl);
          ages.setX(i, age);
          sizes.setX(i, isSmoke ? (.8 + age * (3.3 + c)) * (.35 + heat * .65)
            : isSteam ? (.6 + age * 2.4) * (.4 + heat * .6) : (.10 + c * .10) * (.6 + heat * .4));
        }
        positions.needsUpdate = true; ages.needsUpdate = true; sizes.needsUpdate = true;
      }
    },
  };
}
