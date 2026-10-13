import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group,
  InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Mesh,
  MeshStandardMaterial, Object3D, PlaneGeometry, PointLight, Points, ShaderMaterial, Vector3, Vector4,
} from 'three';
import { SHELTER_COVER, TERRAIN } from '../games/camp/simulation/terrain';
import type { GameState } from '../games/camp/simulation/types';
import { seeded, TAU, triangleGeometry } from './geometry';
import type { RainSurfaces } from './rainSurfaces';

export interface WeatherEffects {
  group: Group;
  update: (time: number, game: GameState, reducedMotion: boolean) => number;
}

/** A single lightning fade reads simulation time, so pausing never advances a strike. */
export function lightningEnvelope(time: number, at: number, reducedMotion: boolean): number {
  const age = time - at;
  return reducedMotion || at < 0 || age < 0 || age > .7 ? 0 : Math.exp(-age * 8.5);
}

/** Bounded particle buffers; no weather simulation or random-number consumption lives here. */
export function createWeatherEffects(rainSurfaces?: RainSurfaces): WeatherEffects {
  const group = new Group(); group.name = 'Wind, rainfall and lightning';
  const random = seeded(3321);
  const dropCount = 480, splashCount = 128, leafCount = 32, gustCount = 28, runoffCount = 42;
  const seeds = Array.from({ length: dropCount }, () => [random(), random(), random(), random()]);
  const lines = (count: number, color: string, opacity: number, name: string) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 6), 3));
    const mesh = new LineSegments(geometry, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    mesh.frustumCulled = false; mesh.name = name; group.add(mesh); return mesh;
  };
  // Camera-facing strips retain their world-space endpoints. Their soft edges,
  // short bright heads and fading tails remain fine at every orbit and zoom.
  const streaks = (count: number, name: string, narrow: boolean) => {
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('position', new Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3));
    geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    for (const name of ['streakTop', 'streakBottom']) {
      geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage));
    }
    const style = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const [sx, sz, , rate] = seeds[i];
      style.set([(narrow ? .04 : .045) + rate * (narrow ? .035 : .065), .4 + sx * .6, sz], i * 3);
    }
    geometry.setAttribute('streakStyle', new InstancedBufferAttribute(style, 3));
    geometry.instanceCount = count;
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { opacity: { value: 0 } },
      vertexShader: `attribute vec3 streakTop; attribute vec3 streakBottom; attribute vec3 streakStyle;
        varying vec2 vUv; varying float vOpacity; varying float vTint;
        void main() {
          vec4 top = modelViewMatrix * vec4(streakTop, 1.0), bottom = modelViewMatrix * vec4(streakBottom, 1.0);
          vec2 direction = top.xy - bottom.xy;
          vec2 side = vec2(direction.y, -direction.x) / max(length(direction), 0.0001);
          vec4 view = mix(bottom, top, uv.y);
          view.xy += side * (uv.x - 0.5) * streakStyle.x;
          vUv = uv; vTint = streakStyle.z;
          vOpacity = streakStyle.y * (1.0 - smoothstep(170.0, 295.0, -view.z));
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `uniform float opacity; varying vec2 vUv; varying float vOpacity; varying float vTint;
        void main() {
          float width = mix(0.94, 0.36, vUv.y);
          float edge = 1.0 - smoothstep(width * 0.2, width, abs(vUv.x * 2.0 - 1.0));
          float tail = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.22, 1.0, vUv.y));
          float alpha = edge * tail * vOpacity * opacity;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(mix(vec3(0.51, 0.62, 0.65), vec3(0.76, 0.8, 0.74), vTint), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 4;
    mesh.name = name; group.add(mesh); return mesh;
  };
  const rain = streaks(dropCount, 'Slanted rain', false);
  const gusts = lines(gustCount, '#d1dac0', .10, 'Low woodland gusts');
  const runoff = streaks(runoffCount, 'Awning roof runoff', true);

  const splashGeometry = new PlaneGeometry(1, 1); splashGeometry.rotateX(-Math.PI / 2);
  splashGeometry.setAttribute('splashAge', new InstancedBufferAttribute(new Float32Array(splashCount), 1).setUsage(DynamicDrawUsage));
  splashGeometry.setAttribute('splashSeed', new InstancedBufferAttribute(new Float32Array(seeds.slice(0, splashCount).map(seed => seed[3])), 1));
  const splashMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { strength: { value: 0 } },
    vertexShader: `attribute float splashAge; attribute float splashSeed;
      varying float age; varying float seed; varying vec2 vUv;
      void main() { age = splashAge; seed = splashSeed; vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float age; varying float seed; varying vec2 vUv; uniform float strength;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p), radius = 0.12 + age * 0.7;
        float aa = max(fwidth(d) * 0.7, 0.028);
        float ring = 1.0 - smoothstep(0.025, 0.025 + aa, abs(d - radius));
        float inner = (1.0 - smoothstep(0.02, 0.02 + aa, abs(d - radius * 0.63))) * 0.32;
        float broken = 0.55 + 0.45 * sin(atan(p.y, p.x) * 5.0 + seed * 25.0);
        float alpha = (ring + inner) * broken * pow(1.0 - age, 1.5) * smoothstep(0.0, 0.07, age) * strength * 0.4;
        if (alpha < 0.006) discard;
        gl_FragColor = vec4(0.57, 0.65, 0.63, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const splashes = new InstancedMesh(splashGeometry, splashMaterial, splashCount); splashes.frustumCulled = false;
  splashes.instanceMatrix.setUsage(DynamicDrawUsage); splashes.renderOrder = 3;
  splashes.name = 'Rain rings on earth and water'; group.add(splashes);
  const splashPose = new Object3D(), splashNormal = new Vector3(), up = new Vector3(0, 1, 0);
  const contactPoint = new Vector3(), runoffSource = new Vector3();

  const sprayGeometry = new BufferGeometry();
  sprayGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(splashCount * 6), 3).setUsage(DynamicDrawUsage));
  sprayGeometry.setAttribute('dropletAge', new Float32BufferAttribute(new Float32Array(splashCount * 2), 1).setUsage(DynamicDrawUsage));
  const sprayMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { strength: splashMaterial.uniforms.strength },
    vertexShader: `attribute float dropletAge; varying float vOpacity;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vOpacity = (1.0 - dropletAge) * (1.0 - smoothstep(175.0, 285.0, -view.z));
        gl_Position = projectionMatrix * view; gl_PointSize = 1.6 + (1.0 - dropletAge) * 0.8;
      }`,
    fragmentShader: `uniform float strength; varying float vOpacity;
      void main() {
        float shape = 1.0 - smoothstep(0.12, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(0.7, 0.75, 0.7, shape * vOpacity * strength * 0.48);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const spray = new Points(sprayGeometry, sprayMaterial); spray.frustumCulled = false;
  spray.renderOrder = 4;
  spray.name = 'Fine rain contact droplets'; group.add(spray);

  const leafGeometry = triangleGeometry([-.30, 0, 0, 0, .09, .08, .29, 0, 0, -.30, 0, 0, .29, 0, 0, 0, -.01, -.11]);
  const leafMaterial = new MeshStandardMaterial({ color: '#c2bc74', roughness: .95, side: DoubleSide, transparent: true, opacity: .9 });
  const leaves = new InstancedMesh(leafGeometry, leafMaterial, leafCount);
  leaves.frustumCulled = false; leaves.name = 'Wind-carried woodland leaves'; group.add(leaves);
  const leafPose = new Object3D(), leafColor = new Color();
  for (let i = 0; i < leafCount; i++) leaves.setColorAt(i, leafColor.set(i % 3 === 0 ? '#a9884f' : i % 3 === 1 ? '#87935e' : '#cad089'));
  let driftTime: number | null = null, driftSeed = -1;
  let gustX = 0, gustZ = 0, leafX = 0, leafZ = 0;

  const coverX = SHELTER_COVER.center.x - 50, coverZ = SHELTER_COVER.center.y - 50;
  const coverHalf = SHELTER_COVER.half;
  const waterShape = TERRAIN.find(object => object.kind === 'water')!.shape;
  function groundHeight(x: number, z: number) {
    if (waterShape.type === 'aabb' && Math.abs(x + 50 - waterShape.center.x) <= waterShape.half.x
      && Math.abs(z + 50 - waterShape.center.y) <= waterShape.half.y) return .095;
    return .04;
  }

  /** The ray uses actual cloth triangles after their same-frame wind, rain and wear deformation. */
  function rainLandingHeight(x: number, z: number, leanX: number, leanZ: number) {
    const floor = groundHeight(x - leanX * .095, z - leanZ * .095);
    return rainSurfaces?.intersect(x, z, leanX, leanZ, contactPoint)
      ? Math.max(floor, contactPoint.y + .01) : floor;
  }

  // Reserve visible contacts for the awning, eaves and creek; the rest scatter over soil.
  const splashLocations = Array.from({ length: splashCount }, (_, i) => {
    const [sx, sz, phase, rate] = seeds[i + 30];
    let x = (sx - .5) * 100, z = (sz - .5) * 100;
    if (i < 24) {
      x = coverX + (sx - .5) * coverHalf.x * 1.92; z = coverZ + (sz - .5) * coverHalf.y * 1.92;
    } else if (i < 40) {
      x = coverX + (sx - .5) * coverHalf.x * 1.95; z = coverZ + coverHalf.y + .22 + rate * .13;
    } else if (i < 68 && waterShape.type === 'aabb') {
      x = waterShape.center.x - 50 + (sx - .5) * waterShape.half.x * 1.68; z = (sz - .5) * 104;
    }
    return { x, z, phase, rate, eave: i >= 24 && i < 40 ? sx : -1 };
  });

  const wetMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { wetness: { value: 0 }, cover: { value: new Vector4(coverX, coverZ, coverHalf.x, coverHalf.y) } },
    vertexShader: `varying vec2 ground; void main(){ground=position.xy;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 ground; uniform float wetness; uniform vec4 cover;
      void main(){vec2 p=vec2(ground.x,-ground.y);
        if(all(lessThan(abs(p-cover.xy),cover.zw))) discard;
        if(length(p-vec2(1.,4.))<4.4) discard;
        float patches=sin(p.x*.31+sin(p.y*.42))*sin(p.y*.37+p.x*.16);
        float edge=smoothstep(.57,.88,patches);
        gl_FragColor=vec4(.43,.56,.51,edge*wetness*.19);}`,
  });
  const wetEarth = new Mesh(new PlaneGeometry(100, 100), wetMaterial);
  wetEarth.rotation.x = -Math.PI / 2; wetEarth.position.y = -.029;
  wetEarth.name = 'Rain-darkened ground'; group.add(wetEarth);

  const bolt = lines(44, '#d8e8ff', 0, 'Lightning at the world strike');
  bolt.material.blending = AdditiveBlending; bolt.material.depthTest = true;
  const strikeLight = new PointLight('#c5dcff', 0, 105, 2); strikeLight.visible = false; group.add(strikeLight);
  let previousStrike = -1, previousSeed = -1;

  function buildBolt(game: GameState) {
    const atmosphere = game.atmosphere, point = atmosphere.lightningPoint;
    if (!point) return;
    const boltRandom = seeded((game.seed ^ Math.round(atmosphere.lightningAt * 1000)) >>> 0);
    const positions = bolt.geometry.getAttribute('position');
    const x = point.x - 50, z = point.y - 50;
    let px = x + 4, py = 47, pz = z - 4, count = 0;
    for (let i = 1; i <= 24; i++) {
      const fraction = i / 24;
      const nx = i === 24 ? x : x + (1 - fraction) * 4 + (boltRandom() - .5) * 3.2;
      const ny = .25 + (1 - fraction) * 46.75;
      const nz = i === 24 ? z : z - (1 - fraction) * 4 + (boltRandom() - .5) * 2.6;
      positions.setXYZ(count++, px, py, pz); positions.setXYZ(count++, nx, ny, nz);
      if (i === 8 || i === 14 || i === 18) {
        const side = i % 2 ? -1 : 1;
        positions.setXYZ(count++, nx, ny, nz); positions.setXYZ(count++, nx + side * 3, ny - 2.7, nz + 1.2);
        positions.setXYZ(count++, nx + side * 3, ny - 2.7, nz + 1.2); positions.setXYZ(count++, nx + side * 4.2, ny - 6, nz + .5);
      }
      px = nx; py = ny; pz = nz;
    }
    bolt.geometry.setDrawRange(0, count); positions.needsUpdate = true;
    strikeLight.position.set(x, 10, z);
    previousStrike = atmosphere.lightningAt; previousSeed = game.seed;
  }

  return {
    group,
    update(time, game, reducedMotion) {
      const weather = game.atmosphere;
      const rainStrength = weather.rainIntensity, wind = weather.windStrength;
      const wx = Math.cos(weather.windAngle), wz = Math.sin(weather.windAngle);
      const motionTime = reducedMotion ? 0 : time;
      // Integrate only new simulation time. Multiplying the current wind by the
      // age of the whole game used to teleport leaves every time the wind turned.
      if (driftTime === null || game.seed !== driftSeed || time < driftTime || time - driftTime > 2) {
        driftTime = time; driftSeed = game.seed;
        gustX = gustZ = leafX = leafZ = 0;
      }
      const dt = reducedMotion ? 0 : Math.min(.5, Math.max(0, time - driftTime));
      driftTime = time;
      gustX += wx * (3 + wind * 5) * dt; gustZ += wz * (3 + wind * 5) * dt;
      leafX += wx * (2 + wind * 5.5) * dt; leafZ += wz * (2 + wind * 5.5) * dt;
      rain.visible = rainStrength > .015; runoff.visible = rainStrength > .07 && !!rainSurfaces;
      splashes.visible = rainStrength > .04 && !reducedMotion; spray.visible = splashes.visible;
      gusts.visible = wind > .28 && !reducedMotion; leaves.visible = wind > .2 && !reducedMotion;
      wetMaterial.uniforms.wetness.value = rainStrength;
      wetEarth.visible = rainStrength > .02;

      if (rain.visible) {
        rain.material.uniforms.opacity.value = .24 + rainStrength * .32;
        const top = rain.geometry.getAttribute('streakTop'), bottom = rain.geometry.getAttribute('streakBottom');
        const count = Math.ceil(dropCount * (.22 + rainStrength * .78));
        rain.geometry.instanceCount = count;
        const leanX = wx * wind * .22, leanZ = wz * wind * .22;
        for (let i = 0; i < count; i++) {
          const [sx, sz, phase, rate] = seeds[i];
          const age = (phase + motionTime * (.78 + rate * .28)) % 1;
          const x = sx * 114 - 57, z = sz * 110 - 55;
          const floor = rainLandingHeight(x, z, leanX, leanZ), y = floor + (1 - age) * (31 - floor);
          const length = .45 + rate * rate * 1.55 + rainStrength * .3;
          const lower = Math.max(floor, y - length);
          top.setXYZ(i, x - leanX * y, y, z - leanZ * y);
          bottom.setXYZ(i, x - leanX * lower, lower, z - leanZ * lower);
        }
        top.needsUpdate = true; bottom.needsUpdate = true;
      }
      if (splashes.visible) {
        splashMaterial.uniforms.strength.value = rainStrength;
        const ages = splashGeometry.getAttribute('splashAge');
        const sprayPositions = sprayGeometry.getAttribute('position'), sprayAges = sprayGeometry.getAttribute('dropletAge');
        for (let i = 0; i < splashCount; i++) {
          const location = splashLocations[i], { phase, rate } = location;
          let { x, z } = location;
          if (location.eave >= 0 && rainSurfaces) {
            rainSurfaces.eave(location.eave, runoffSource);
            x = runoffSource.x; z = runoffSource.z + .22 + rate * .13;
          }
          const age = (phase + motionTime * (1.45 + rate * .45)) % 1;
          splashNormal.set(0, 1, 0);
          if (rainSurfaces?.intersect(x, z, 0, 0, contactPoint, splashNormal)) {
            contactPoint.addScaledVector(splashNormal, .014);
          } else contactPoint.set(x, groundHeight(x, z) + .025, z);
          splashPose.position.copy(contactPoint); splashPose.quaternion.setFromUnitVectors(up, splashNormal);
          splashPose.scale.setScalar(.5 + rate * .62); splashPose.updateMatrix(); splashes.setMatrixAt(i, splashPose.matrix);
          ages.setX(i, age);
          for (let j = 0; j < 2; j++) {
            const angle = phase * TAU + j * 2.5, scatter = age * (.19 + rate * .32);
            sprayPositions.setXYZ(i * 2 + j, contactPoint.x + Math.cos(angle) * scatter + wx * age * wind * .12,
              contactPoint.y + Math.sin(age * Math.PI) * (.19 + rate * .32), contactPoint.z + Math.sin(angle) * scatter + wz * age * wind * .12);
            sprayAges.setX(i * 2 + j, age);
          }
        }
        splashes.instanceMatrix.needsUpdate = true; ages.needsUpdate = true;
        sprayPositions.needsUpdate = true; sprayAges.needsUpdate = true;
      }
      if (runoff.visible && rainSurfaces) {
        runoff.material.uniforms.opacity.value = rainStrength * .62;
        const top = runoff.geometry.getAttribute('streakTop'), bottom = runoff.geometry.getAttribute('streakBottom');
        for (let i = 0; i < runoffCount; i++) {
          const [sx, , phase, rate] = seeds[i + 90];
          const age = (phase + motionTime * (.85 + rate * .4)) % 1;
          rainSurfaces.eave(sx, runoffSource);
          const x = runoffSource.x + wx * age * wind * .65;
          const z = runoffSource.z + .012 + wz * age * wind * .65;
          const y = Math.max(.06, (runoffSource.y + .012) * (1 - age * age));
          const length = .12 + rate * .17 + age * .36, lower = Math.max(.04, y - length);
          top.setXYZ(i, x, y, z); bottom.setXYZ(i, x + wx * (y - lower) * wind * .07, lower, z + wz * (y - lower) * wind * .07);
        }
        top.needsUpdate = true; bottom.needsUpdate = true;
      }
      if (gusts.visible) {
        gusts.material.opacity = (wind - .2) * .14;
        const positions = gusts.geometry.getAttribute('position');
        for (let i = 0; i < gustCount; i++) {
          const [sx, sz, phase] = seeds[i + 170];
          const age = (phase + motionTime * .14) % 1;
          const x = ((sx * 104 + gustX) % 104 + 104) % 104 - 52;
          const z = ((sz * 104 + gustZ) % 104 + 104) % 104 - 52;
          const y = .9 + phase * 5 + Math.sin(age * TAU) * .25, length = (1 + wind * 2.5) * Math.sin(age * Math.PI);
          positions.setXYZ(i * 2, x, y, z); positions.setXYZ(i * 2 + 1, x - wx * length, y - .1, z - wz * length);
        }
        positions.needsUpdate = true;
      }
      if (leaves.visible) {
        leafMaterial.opacity = Math.min(.95, (wind - .15) * 1.55);
        for (let i = 0; i < leafCount; i++) {
          const [sx, sz, phase, rate] = seeds[i + 210];
          const variation = .65 + rate * .4;
          const x = ((sx * 104 + leafX * variation) % 104 + 104) % 104 - 52;
          const z = ((sz * 104 + leafZ * variation) % 104 + 104) % 104 - 52;
          leafPose.position.set(x, .6 + phase * 4.8 + Math.sin(motionTime * 2 + phase * TAU) * .48, z);
          leafPose.rotation.set(motionTime * (1 + rate), phase * TAU + motionTime * .9, Math.sin(motionTime * 2.6 + i) * .9);
          leafPose.scale.setScalar(.65 + rate * .65); leafPose.updateMatrix(); leaves.setMatrixAt(i, leafPose.matrix);
        }
        leaves.instanceMatrix.needsUpdate = true;
      }

      if (weather.lightningPoint && (weather.lightningAt !== previousStrike || game.seed !== previousSeed)) buildBolt(game);
      const flash = lightningEnvelope(time, weather.lightningAt, reducedMotion);
      bolt.visible = flash > .018 && weather.lightningPoint !== null;
      strikeLight.visible = bolt.visible;
      bolt.material.opacity = flash; strikeLight.intensity = flash * 1300;
      return flash;
    },
  };
}
