import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group,
  InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Object3D,
  PlaneGeometry, PointLight, Points, ShaderMaterial, Vector4,
} from 'three';
import { SHELTER_COVER, TERRAIN } from '../game/terrain';
import type { GameState } from '../game/types';
import { seeded, TAU, triangleGeometry } from './geometry';

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
export function createWeatherEffects(): WeatherEffects {
  const group = new Group(); group.name = 'Wind, rainfall and lightning';
  const random = seeded(3321);
  const dropCount = 280, splashCount = 100, leafCount = 32, gustCount = 28, runoffCount = 42;
  const seeds = Array.from({ length: dropCount }, () => [random(), random(), random(), random()]);
  const lines = (count: number, color: string, opacity: number, name: string) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 6), 3));
    const mesh = new LineSegments(geometry, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    mesh.frustumCulled = false; mesh.name = name; group.add(mesh); return mesh;
  };
  const rain = lines(dropCount, '#dce9e1', .34, 'Slanted rain');
  const gusts = lines(gustCount, '#d1dac0', .10, 'Low woodland gusts');
  const runoff = lines(runoffCount, '#c6dfe0', .34, 'Awning roof runoff');

  const splashGeometry = new BufferGeometry();
  splashGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(splashCount * 3), 3));
  splashGeometry.setAttribute('splashAge', new Float32BufferAttribute(new Float32Array(splashCount), 1));
  const splashMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { strength: { value: 0 } },
    vertexShader: `attribute float splashAge; varying float age;
      void main(){ age=splashAge; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        gl_PointSize=2.0+splashAge*6.0; }`,
    fragmentShader: `varying float age; uniform float strength;
      void main(){float d=length((gl_PointCoord-.5)*vec2(1.,1.6))*2.;
        float ring=smoothstep(.72,.86,d)*(1.-smoothstep(.87,1.,d));
        gl_FragColor=vec4(.73,.86,.85,ring*(1.-age)*strength*.5);}`,
  });
  const splashes = new Points(splashGeometry, splashMaterial); splashes.frustumCulled = false;
  splashes.name = 'Rain rings on earth and water'; group.add(splashes);

  const leafGeometry = triangleGeometry([-.30, 0, 0, 0, .09, .08, .29, 0, 0, -.30, 0, 0, .29, 0, 0, 0, -.01, -.11]);
  const leafMaterial = new MeshStandardMaterial({ color: '#c2bc74', roughness: .95, side: DoubleSide, transparent: true, opacity: .9 });
  const leaves = new InstancedMesh(leafGeometry, leafMaterial, leafCount);
  leaves.frustumCulled = false; leaves.name = 'Wind-carried woodland leaves'; group.add(leaves);
  const leafPose = new Object3D(), leafColor = new Color();
  for (let i = 0; i < leafCount; i++) leaves.setColorAt(i, leafColor.set(i % 3 === 0 ? '#a9884f' : i % 3 === 1 ? '#87935e' : '#cad089'));

  const coverX = SHELTER_COVER.center.x - 50, coverZ = SHELTER_COVER.center.y - 50;
  const coverHalf = SHELTER_COVER.half;
  const tentShape = TERRAIN.find(object => object.kind === 'tent')!.shape;
  function landingHeight(x: number, z: number) {
    if (Math.abs(x - coverX) <= coverHalf.x && Math.abs(z - coverZ) <= coverHalf.y) {
      const along = (z - coverZ + coverHalf.y) / (coverHalf.y * 2);
      return 8.5 - along * .85;
    }
    if (tentShape.type === 'aabb' && Math.abs(x + 50 - tentShape.center.x) <= tentShape.half.x
      && Math.abs(z + 50 - tentShape.center.y) <= tentShape.half.y) {
      return tentShape.half.x * 1.07 * (1 - Math.abs(x + 50 - tentShape.center.x) / tentShape.half.x) + .1;
    }
    return .04;
  }

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
      rain.visible = rainStrength > .015; runoff.visible = rainStrength > .07;
      splashes.visible = rainStrength > .04 && !reducedMotion;
      gusts.visible = wind > .28 && !reducedMotion; leaves.visible = wind > .2 && !reducedMotion;
      wetMaterial.uniforms.wetness.value = rainStrength;
      wetEarth.visible = rainStrength > .02;

      if (rain.visible) {
        rain.material.opacity = .18 + rainStrength * .25;
        const positions = rain.geometry.getAttribute('position');
        const count = Math.ceil(dropCount * (.22 + rainStrength * .78));
        rain.geometry.setDrawRange(0, count * 2);
        for (let i = 0; i < count; i++) {
          const [sx, sz, phase, rate] = seeds[i];
          const age = (phase + motionTime * (.78 + rate * .28)) % 1;
          const x = sx * 114 - 57, z = sz * 110 - 55;
          const floor = landingHeight(x, z), y = floor + (1 - age) * (31 - floor);
          const lean = wind * .22, length = 1.4 + rainStrength * 1.15;
          positions.setXYZ(i * 2, x - wx * y * lean, y, z - wz * y * lean);
          positions.setXYZ(i * 2 + 1, x - wx * (y - length) * lean, Math.max(floor, y - length), z - wz * (y - length) * lean);
        }
        positions.needsUpdate = true;
      }
      if (splashes.visible) {
        splashMaterial.uniforms.strength.value = rainStrength;
        const positions = splashGeometry.getAttribute('position'), ages = splashGeometry.getAttribute('splashAge');
        for (let i = 0; i < splashCount; i++) {
          const [sx, sz, phase] = seeds[i + 30];
          const x = sx * 106 - 53, z = sz * 106 - 53;
          positions.setXYZ(i, x, landingHeight(x, z) + .04, z);
          ages.setX(i, (phase + time * 1.65) % 1);
        }
        positions.needsUpdate = true; ages.needsUpdate = true;
      }
      if (runoff.visible) {
        runoff.material.opacity = rainStrength * .36;
        const positions = runoff.geometry.getAttribute('position');
        for (let i = 0; i < runoffCount; i++) {
          const [sx, , phase, rate] = seeds[i + 90];
          const age = (phase + motionTime * (.85 + rate * .4)) % 1;
          const x = coverX + (sx - .5) * coverHalf.x * 2 + wx * age * wind * .65;
          const z = coverZ + coverHalf.y + .07 + wz * age * wind * .65;
          const y = Math.max(.06, 7.65 * (1 - age * age));
          positions.setXYZ(i * 2, x, y, z); positions.setXYZ(i * 2 + 1, x + wx * .045, Math.max(.04, y - .24 - age * .35), z + wz * .045);
        }
        positions.needsUpdate = true;
      }
      if (gusts.visible) {
        gusts.material.opacity = (wind - .2) * .14;
        const positions = gusts.geometry.getAttribute('position');
        for (let i = 0; i < gustCount; i++) {
          const [sx, sz, phase] = seeds[i + 170];
          const age = (phase + motionTime * .14) % 1;
          const x = ((sx * 104 + wx * motionTime * (3 + wind * 5)) % 104 + 104) % 104 - 52;
          const z = ((sz * 104 + wz * motionTime * (3 + wind * 5)) % 104 + 104) % 104 - 52;
          const y = .9 + phase * 5 + Math.sin(age * TAU) * .25, length = (1 + wind * 2.5) * Math.sin(age * Math.PI);
          positions.setXYZ(i * 2, x, y, z); positions.setXYZ(i * 2 + 1, x - wx * length, y - .1, z - wz * length);
        }
        positions.needsUpdate = true;
      }
      if (leaves.visible) {
        leafMaterial.opacity = Math.min(.95, (wind - .15) * 1.55);
        for (let i = 0; i < leafCount; i++) {
          const [sx, sz, phase, rate] = seeds[i + 210];
          const travel = motionTime * (2 + wind * 5.5) * (.65 + rate * .4);
          const x = ((sx * 104 + wx * travel) % 104 + 104) % 104 - 52;
          const z = ((sz * 104 + wz * travel) % 104 + 104) % 104 - 52;
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
