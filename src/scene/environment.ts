import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group,
  LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  PointLight, Points, ShaderMaterial, Vector2, Vector3,
} from 'three';
import type { Object3D } from 'three';
import { LOCATIONS } from '../game/constants';
import { TERRAIN } from '../game/terrain';
import type { TerrainObject } from '../game/terrain';
import type { ActionId, GameState, Point } from '../game/types';
import { addMesh, material, pineBough, seeded, Shapes, StaticBatch, TAU, triangleGeometry, vertexTint } from './geometry';
import type { XYZ } from './geometry';

export interface SceneMarker { id: string; action: ActionId; name: string; point: Vector3 }
export interface CampEnvironment {
  group: Group; markers: SceneMarker[]; pickables: Object3D[];
  update: (time: number, game: GameState, reducedMotion: boolean) => void;
}

const pathSegments = [
  [LOCATIONS.wood, LOCATIONS.fire], [LOCATIONS.food, LOCATIONS.fire],
  [LOCATIONS.fire, LOCATIONS.rest], [LOCATIONS.fire, LOCATIONS.storage],
  [LOCATIONS.storage, { x: 18, y: 85 }], [LOCATIONS.fire, { x: 51, y: 95 }],
] as const;

function pathDistance(x: number, y: number) {
  let nearest = Infinity;
  for (const [a, b] of pathSegments) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    nearest = Math.min(nearest, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return nearest;
}

function insideObject(point: Point, margin = 0) {
  return TERRAIN.some(object => {
    const s = object.shape;
    return s.type === 'circle' ? Math.hypot(point.x - s.center.x, point.y - s.center.y) < s.radius + margin
      : Math.abs(point.x - s.center.x) < s.half.x + margin && Math.abs(point.y - s.center.y) < s.half.y + margin;
  });
}

export function createEnvironment(shapes: Shapes): CampEnvironment {
  const group = new Group(); group.name = 'Modeled woodland camp';
  const random = seeded(64391);
  const batch = new StaticBatch();
  const low = new StaticBatch();
  const pickables: Object3D[] = [];
  const markers: SceneMarker[] = [];
  const palette = {
    bark: material('#65452a'), barkDark: material('#443424'), barkLight: material('#8b6038'),
    cut: material('#c18c4e'), rings: material('#895b32'),
    pine: [material('#193e2b'), material('#254d2e'), material('#365e31'), material('#53773a')],
    moss: material('#526a30'), grass: [material('#354e26'), material('#627a35'), material('#849247')],
    rock: material('#7d8277', { flatShading: true }), rockDark: material('#606b63', { flatShading: true }),
    cream: material('#dfc999', { side: DoubleSide }), canvasShadow: material('#aa9572', { side: DoubleSide }),
    canvasInside: material('#5c5542', { side: DoubleSide }), rope: material('#c4ac78'),
    metal: material('#444a3f', { metalness: .42, roughness: .58 }),
    brass: material('#ac803f', { metalness: .52, roughness: .45 }),
    yellow: material('#e5c15e'), flower: material('#eee0ac'),
    berry: material('#b44338'), leaf: material('#446e31', { side: DoubleSide }), thorn: material('#665838'),
    glow: material('#ffd889', { emissive: '#ffb943', emissiveIntensity: 2.4, roughness: .35 }),
    charcoal: material('#342c23'), ember: material('#ff9a29', { emissive: '#ff4c0b', emissiveIntensity: 2.2 }),
  };
  const boughs = Array.from({ length: 4 }, (_, i) => pineBough(119 + i));

  // A vertex-coloured ground mesh keeps soil, paths and moss dimensional without an image backdrop.
  const land = new PlaneGeometry(280, 280, 112, 112); land.rotateX(-Math.PI / 2);
  const p = land.getAttribute('position');
  const creek = TERRAIN.find(object => object.kind === 'water')!;
  const cs = creek.shape;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const outside = Math.max(Math.abs(x) - 50, Math.abs(z) - 50, 0);
    let height = outside > 0 ? Math.min(4.5, outside * .09) * (.55 + Math.sin(x * .055) * Math.cos(z * .08) * .3) : -.045;
    if (cs.type === 'aabb' && Math.abs(x + 50 - cs.center.x) < cs.half.x && Math.abs(z + 50 - cs.center.y) < cs.half.y) height = -.32;
    p.setY(i, height);
  }
  land.computeVertexNormals();
  vertexTint(land, (x, _y, z) => {
    const d = pathDistance(x + 50, z + 50);
    const noise = Math.sin(x * .19 + z * .13) * Math.cos(x * .11 - z * .18) * .012;
    const soil = new Color('#927044'), moss = new Color('#3b4e27');
    const clearing = Math.hypot(x - 1, z - 5) < 30 ? .24 : 0;
    const blend = Math.max(clearing, Math.max(0, 1 - d / 5.6));
    return moss.lerp(soil, blend).offsetHSL(0, 0, noise);
  });
  const ground = new Mesh(land, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; ground.name = 'Continuous modeled earth'; group.add(ground);

  const buildPine = (x: number, z: number, radius: number, height: number, variant: number, detailed = true) => {
    batch.add(shapes.taper, palette.bark, [x, height * .42, z], [radius, height * .84, radius]);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU + variant;
      batch.branch(shapes.taper, palette.barkDark, [x, .7, z], [x + Math.cos(a) * radius, .08, z + Math.sin(a) * radius], radius * .27);
    }
    for (let k = 0; k < 7; k++) {
      const y = height * (.28 + k * .092);
      const spread = height * .28 * (1 - k * .11);
      batch.add(boughs[(variant + k) % boughs.length], palette.pine[(variant + k) % 4], [x, y, z], [spread, height * .19, spread], [0, k * .82 + variant, 0]);
      if (detailed && k < 5) for (let j = 0; j < 4; j++) {
        const a = j / 4 * TAU + k * 1.4;
        const end: XYZ = [x + Math.cos(a) * spread * .8, y - .3, z + Math.sin(a) * spread * .8];
        batch.branch(shapes.taper, palette.barkDark, [x, y + .45, z], end, .13 + (4 - k) * .025);
        batch.add(shapes.rock, palette.pine[(j + k + 2) % 4], end, [spread * .27, .42, spread * .39], [0, -a, .1]);
      }
    }
  };

  const lantern = (x: number, y: number, z: number, scale = 1) => {
    const r = .35 * scale;
    batch.add(shapes.cylinder, palette.glow, [x, y, z], [r * .78, .65 * scale, r * .78]);
    batch.add(shapes.cylinder, palette.brass, [x, y - .37 * scale, z], [r, .12 * scale, r]);
    batch.add(shapes.cone, palette.brass, [x, y + .47 * scale, z], [r * 1.1, .25 * scale, r * 1.1]);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU;
      batch.add(shapes.cylinder, palette.metal, [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [.035 * scale, .75 * scale, .035 * scale]);
    }
    batch.add(shapes.torus, palette.metal, [x, y + .7 * scale, z], [.2 * scale, .24 * scale, .2 * scale]);
  };

  const log = (x: number, y: number, z: number, length: number, radius: number) => {
    batch.add(shapes.cylinder, palette.bark, [x, y, z], [radius, length, radius], [0, 0, Math.PI / 2]);
    for (const side of [-1, 1]) {
      batch.add(shapes.cylinder, palette.cut, [x + side * (length / 2 + .015), y, z], [radius * .91, .045, radius * .91], [0, 0, Math.PI / 2]);
      for (const r of [.35, .68]) batch.add(shapes.torus, palette.rings, [x + side * (length / 2 + .044), y, z], [radius * r, radius * r, radius * r], [0, Math.PI / 2, 0]);
    }
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + .2;
      batch.branch(shapes.cylinder, palette.barkLight, [x - length * .45, y + Math.cos(a) * radius, z + Math.sin(a) * radius], [x + length * .43, y + Math.cos(a + .07) * radius, z + Math.sin(a + .07) * radius], .035);
    }
  };

  const crate = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    batch.add(shapes.box, palette.barkDark, [x, y + h / 2, z], [w, h, d]);
    for (let i = 0; i < 4; i++) {
      const xp = x - w / 2 + (i + .5) * w / 4;
      batch.add(shapes.box, palette.cut, [xp, y + h / 2, z + d / 2 + .02], [w / 4 - .055, h - .08, .07]);
      batch.add(shapes.box, palette.barkLight, [xp, y + h + .025, z], [w / 4 - .055, .07, d - .08]);
    }
    for (const side of [-1, 1]) {
      batch.add(shapes.box, palette.bark, [x + side * (w * .35), y + h / 2, z + d / 2 + .08], [.13, h, .12]);
      batch.add(shapes.box, palette.brass, [x + side * (w * .35), y + h * .55, z + d / 2 + .15], [.14, .2, .035]);
    }
  };

  for (const object of TERRAIN) {
    const { shape } = object; const x = shape.center.x - 50, z = shape.center.y - 50;
    if (object.kind === 'tree' && shape.type === 'circle') buildPine(x, z, shape.radius, 16 + shape.radius * 2.1, Math.floor(random() * 4));
    if (object.kind === 'rock' && shape.type === 'circle') {
      batch.add(shapes.rock, palette.rock, [x, shape.radius * .59, z], [shape.radius, shape.radius * .83, shape.radius], [.2, random() * TAU, .13]);
      batch.add(shapes.rock, palette.moss, [x - .18, shape.radius * 1.18, z + .08], [shape.radius * .82, shape.radius * .25, shape.radius * .74], [0, .3, .08]);
      for (let k = 0; k < 5; k++) low.add(shapes.pebble, palette.rockDark, [x + (random() - .5) * shape.radius * 1.4, .11, z + (random() - .5) * shape.radius * 1.4], [.22, .14, .24]);
    }
    if (object.id === 'wood-stack' && shape.type === 'aabb') {
      for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
        log(x + (random() - .5) * .12, .46 + row * .74, z - 1.1 + i * .97 + row * .48, shape.half.x * 1.94, .47);
      }
      markers.push({ id: 'wood', action: 'wood', name: '松林', point: new Vector3(x, 4.8, z) });
      addPickProxy(object, 'wood', 3);
    } else if (object.kind === 'storage' && shape.type === 'aabb') {
      crate(x - 1.45, 0, z + .5, 2.3, 1.75, 2.3);
      crate(x + 1.1, 0, z - .35, 2.4, 2.2, 2.5);
      crate(x + .9, 2.2, z - .6, 1.6, 1.2, 1.65);
      batch.add(shapes.cylinder, palette.barkLight, [x - 1.3, 1.12, z - 1.7], [.7, 2.2, .7]);
      for (const y of [.35, 1.8]) batch.add(shapes.torus, palette.metal, [x - 1.3, y, z - 1.7], [.73, .73, .73], [Math.PI / 2, 0, 0]);
      lantern(x + 1, 4.03, z - .6, .9);
      addPickProxy(object, 'eat', 4.5);
    }
    if (object.kind === 'tent' && shape.type === 'aabb') {
      const { x: hx, y: hz } = shape.half; const height = hx * 1.07;
      const roof = triangleGeometry([
        -hx, 0, -hz, 0, height, -hz, 0, height, hz, -hx, 0, -hz, 0, height, hz, -hx, 0, hz,
        0, height, -hz, hx, 0, -hz, hx, 0, hz, 0, height, -hz, hx, 0, hz, 0, height, hz,
      ]);
      batch.add(roof, palette.cream, [x, .08, z]); roof.dispose();
      const back = triangleGeometry([-hx, 0, -hz, hx, 0, -hz, 0, height, -hz]);
      batch.add(back, palette.canvasShadow, [x, .05, z]); back.dispose();
      const entrance = triangleGeometry([
        -hx, 0, hz, -1.7, .12, hz + .05, 0, height, hz,
        1.7, .12, hz + .05, hx, 0, hz, 0, height, hz,
      ]);
      batch.add(entrance, palette.canvasShadow, [x, .07, z]); entrance.dispose();
      batch.add(shapes.box, palette.canvasInside, [x, .07, z], [hx * 1.98, .13, hz * 1.98]);
      batch.add(shapes.capsule, palette.moss, [x - .8, .35, z], [1, .25, 1.75], [Math.PI / 2, 0, 0]);
      for (const side of [-1, 1]) {
        batch.add(shapes.cylinder, palette.barkLight, [x, height / 2, z + side * (hz + .1)], [.105, height + .4, .105]);
        batch.branch(shapes.cylinder, palette.rope, [x, height, z + side * hz], [x, .16, z + side * (hz + 2.2)], .025);
        for (const sx of [-1, 1]) batch.branch(shapes.cylinder, palette.rope, [x + sx * hx * .82, .9, z + side * hz * .7], [x + sx * hx * .98, .09, z + side * hz * .96], .028);
      }
      batch.branch(shapes.cylinder, palette.bark, [x, height + .08, z - hz - .4], [x, height + .08, z + hz + .4], .105);
      // Four stitched canvas seams follow the actual pitched roof.
      for (const zz of [-hz * .6, hz * .1, hz * .75]) for (const side of [-1, 1]) batch.branch(shapes.cylinder, palette.rope, [x, height + .11, z + zz], [x + side * hx, .13, z + zz], .022);
      lantern(x + hx * .65, 1.75, z + hz - .15, 1.15);
      crate(x + hx * .63, .05, z + hz * .5, 1.25, .6, .9);
      markers.push({ id: 'rest', action: 'rest', name: '休息区', point: new Vector3(x, height + 1.55, z) });
      addPickProxy(object, 'rest', height);
    }
    if (object.kind === 'thorns' && shape.type === 'circle') {
      for (let k = 0; k < 18; k++) {
        const a = k / 18 * TAU, r = Math.sqrt(random()) * shape.radius * .82;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const top: XYZ = [px, 1.6 + random() * .7, pz];
        batch.branch(shapes.taper, palette.thorn, [x, .1, z], top, .065);
        batch.add(shapes.rock, palette.leaf, [px, top[1], pz], [.8, .6, .7], [random(), a, .4]);
        for (let b = 0; b < 3; b++) batch.add(shapes.sphere, palette.berry, [px + (random() - .5) * .8, top[1] + .25, pz + (random() - .5) * .8], [.18, .19, .18]);
      }
    }
  }

  // The safe berry harvest is north of the hazardous brambles, beside its shared task station.
  const food = LOCATIONS.food;
  for (let k = 0; k < 13; k++) {
    const x = food.x - 50 + (random() - .5) * 7, z = food.y - 53 + (random() - .5) * 3.4;
    low.add(shapes.rock, palette.leaf, [x, .5, z], [.85, .65, .85], [0, k, 0]);
    for (let j = 0; j < 3; j++) low.add(shapes.sphere, palette.berry, [x + (random() - .5), 1, z + (random() - .5)], [.15, .15, .15]);
  }
  markers.push({ id: 'food', action: 'food', name: '浆果丛', point: new Vector3(food.x - 50, 3.7, food.y - 52) });
  const berryPick = new Mesh(shapes.sphere, new MeshBasicMaterial()); berryPick.position.set(food.x - 50, 1, food.y - 52); berryPick.scale.set(4.8, 2, 3);
  berryPick.userData.action = 'food'; berryPick.updateMatrixWorld(); pickables.push(berryPick);

  // Distant trees are outside the playable square, so every reachable trunk is in TERRAIN.
  for (let i = 0; i < 94; i++) {
    const side = i % 4, edge = 54 + random() * 32, along = (random() - .5) * 174;
    const x = side === 0 ? -edge : side === 1 ? edge : along;
    const z = side === 2 ? -edge : side === 3 ? edge : along;
    const height = (z > 50 ? 11 : 16) + random() * 12;
    buildPine(x, z, .8 + random() * .55, height, i % 4, false);
  }

  // Small plants and pebbles do not create unregistered movement obstacles.
  for (let i = 0; i < 1500; i++) {
    const gx = random() * 116 - 8, gy = random() * 116 - 8;
    if (insideObject({ x: gx, y: gy }, .4)) continue;
    const d = pathDistance(gx, gy);
    if (d < 2.6 && random() < .95) continue;
    const x = gx - 50, z = gy - 50;
    if (i % 4 === 0) {
      low.add(shapes.pebble, i % 8 ? palette.rockDark : palette.rock, [x, .085, z], [.13 + random() * .2, .07 + random() * .1, .1 + random() * .16], [random(), random(), random()]);
      continue;
    }
    const height = .18 + random() * .48;
    for (let j = 0; j < 3; j++) low.add(shapes.cone, palette.grass[(i + j) % 3], [x + (random() - .5) * .35, height / 2, z + (random() - .5) * .35], [.06, height, .08], [random() * .35, random() * TAU, (random() - .5) * .6]);
    if (i % 13 === 0 && d > 3) {
      for (let j = 0; j < 3; j++) {
        const fx = x + (random() - .5) * .7, fz = z + (random() - .5) * .7, fy = .6 + random() * .4;
        low.add(shapes.cylinder, palette.leaf, [fx, fy / 2, fz], [.027, fy, .027]);
        for (let petal = 0; petal < 5; petal++) {
          const a = petal / 5 * TAU;
          low.add(shapes.flower, i % 26 === 0 ? palette.flower : palette.yellow, [fx + Math.cos(a) * .105, fy, fz + Math.sin(a) * .105], [.09, .037, .105]);
        }
        low.add(shapes.flower, palette.cut, [fx, fy + .02, fz], [.065, .04, .065]);
      }
    }
  }

  // Folded fern fronds form low, walk-through understory around the clearing.
  // Their silhouettes use only six triangles, leaving the polygon budget for characters and camp props.
  const frond = triangleGeometry([
    0, 0, 0, -.2, .34, .4, 0, .43, .56,
    0, 0, 0, 0, .43, .56, .2, .34, .4,
    -.2, .34, .4, -.11, .68, .84, 0, .43, .56,
    0, .43, .56, -.11, .68, .84, 0, .76, 1.12,
    0, .43, .56, 0, .76, 1.12, .11, .68, .84,
    0, .43, .56, .11, .68, .84, .2, .34, .4,
  ]);
  for (let cluster = 0; cluster < 70; cluster++) {
    const a = random() * TAU, radius = 23 + random() * 22;
    const gx = 51 + Math.cos(a) * radius, gy = 56 + Math.sin(a) * radius * .92;
    for (let j = 0; j < 8; j++) {
      const px = gx + (random() - .5) * 7, py = gy + (random() - .5) * 7;
      if (insideObject({ x: px, y: py }, .5) || pathDistance(px, py) < 3.8) continue;
      const size = .75 + random() * .75;
      for (let leaf = 0; leaf < 7; leaf++) low.add(frond, leaf % 3 ? palette.leaf : palette.grass[1], [px - 50, .035, py - 50], [size, size, size], [0, leaf / 7 * TAU + a, 0]);
    }
  }
  frond.dispose();

  // The modeled creek uses exactly the shared rectangle; lighter banks sit within its edge.
  let water: Mesh | null = null;
  const waterFoam: Mesh[] = [];
  if (cs.type === 'aabb') {
    const x = cs.center.x - 50, z = cs.center.y - 50;
    const waterGeo = new PlaneGeometry(cs.half.x * 2, cs.half.y * 2, 10, 36); waterGeo.rotateX(-Math.PI / 2);
    water = new Mesh(waterGeo, material('#4d9690', { roughness: .3, metalness: .24, transparent: true, opacity: .88 }));
    water.position.set(x, .055, z); water.receiveShadow = true; water.name = 'Shared deep creek footprint'; group.add(water);
    for (let k = 0; k < 36; k++) for (const side of [-1, 1]) {
      const zz = z - cs.half.y + (k + .5) / 36 * cs.half.y * 2;
      low.add(shapes.pebble, k % 3 === 0 ? palette.rock : palette.rockDark, [x + side * (cs.half.x - .18), .16, zz], [.33 + random() * .25, .17 + random() * .12, .48], [.1, random(), .2]);
    }
    const foamMaterial = new MeshBasicMaterial({ color: '#c7e0ca', transparent: true, opacity: .37, depthWrite: false });
    for (let k = 0; k < 20; k++) {
      const foam = addMesh(group, shapes.torus, foamMaterial, [x + (random() - .5) * cs.half.x * 1.5, .08, z - cs.half.y + random() * cs.half.y * 2], [.28 + random() * .35, .06, .5 + random() * .55], [Math.PI / 2, 0, 0]);
      foam.userData.originZ = foam.position.z; foam.castShadow = false; foam.receiveShadow = false; waterFoam.push(foam);
    }
  }

  const fireObject = TERRAIN.find(object => object.kind === 'fire')!;
  const fs = fireObject.shape; const fx = fs.center.x - 50, fz = fs.center.y - 50;
  const radius = fs.type === 'circle' ? fs.radius : fs.half.x;
  for (let i = 0; i < 15; i++) {
    const a = i / 15 * TAU;
    batch.add(shapes.rock, i % 3 ? palette.rock : palette.rockDark, [fx + Math.cos(a) * (radius - .47), .37, fz + Math.sin(a) * (radius - .47)], [.51, .49, .53], [i * .4, i * 2, .1]);
  }
  batch.add(shapes.cylinder, palette.charcoal, [fx, .06, fz], [radius * .83, .14, radius * .83]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    batch.branch(shapes.cylinder, i % 2 ? palette.charcoal : palette.bark, [fx + Math.cos(a) * 2.2, .3, fz + Math.sin(a) * 2.2], [fx + Math.cos(a + Math.PI) * 1.1, .8, fz + Math.sin(a + Math.PI) * 1.1], .34);
  }
  for (let i = 0; i < 18; i++) batch.add(shapes.pebble, palette.ember, [fx + (random() - .5) * 2.5, .21, fz + (random() - .5) * 2.5], [.14, .12, .17]);
  for (const dx of [-1.6, 1.6]) batch.branch(shapes.cylinder, palette.barkDark, [fx + dx, .1, fz + .5], [fx, 5.5, fz + .1], .105);
  batch.branch(shapes.cylinder, palette.metal, [fx, 5.35, fz + .1], [fx, 3.25, fz + .1], .035);
  batch.add(shapes.halfSphere, palette.metal, [fx, 3.05, fz + .1], [.65, .62, .65], [Math.PI, 0, 0]);
  batch.add(shapes.torus, palette.brass, [fx, 3.05, fz + .1], [.66, .66, .66], [Math.PI / 2, 0, 0]);
  markers.push({ id: 'fire', action: 'fire', name: '篝火', point: new Vector3(fx, 7, fz) });
  addPickProxy(fireObject, 'fire', 5);
  markers.push({ id: 'explore', action: 'explore', name: '林间', point: new Vector3(LOCATIONS.explore.x - 50, 1.4, LOCATIONS.explore.y - 50) });

  group.add(batch.finish('Trunks, branches, boughs and camp props'));
  group.add(low.finish('Grass, wildflowers and ground details', false));
  boughs.forEach(geometry => geometry.dispose());

  const flameShape = new LatheGeometry([new Vector2(0, 0), new Vector2(.7, .2), new Vector2(.86, .8), new Vector2(.64, 1.6), new Vector2(.35, 2.5), new Vector2(0, 3.8)], 12);
  const flames = new Group(); flames.name = 'Modeled dancing flames'; flames.position.set(fx, .3, fz); group.add(flames);
  const flameMaterials = [
    new MeshBasicMaterial({ color: '#ff7629', transparent: true, opacity: .93, depthWrite: false }),
    new MeshBasicMaterial({ color: '#ffbc3e', transparent: true, opacity: .96, depthWrite: false }),
    new MeshBasicMaterial({ color: '#ffe295', depthWrite: false }),
  ];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU;
    const flame = addMesh(flames, flameShape, flameMaterials[i % 3], [Math.cos(a) * .65, 0, Math.sin(a) * .65], [.75, .75 + random() * .35, .75]);
    flame.castShadow = false; flame.receiveShadow = false; flame.userData.phase = random() * TAU;
  }
  const light = new PointLight('#ffb65a', 220, 34, 2); light.position.set(fx, 3.2, fz); group.add(light);
  const glow = new Mesh(new PlaneGeometry(13, 13), new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { strength: { value: .23 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform float strength;void main(){float d=length(vUv-.5)*2.;gl_FragColor=vec4(1.,.38,.05,pow(max(0.,1.-d),2.)*strength);}',
  }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(fx, .09, fz); group.add(glow);

  const emberPositions = new Float32Array(42 * 3); const emberSeeds = Array.from({ length: 42 }, () => [random(), random(), random()]);
  const emberGeometry = new BufferGeometry(); emberGeometry.setAttribute('position', new Float32BufferAttribute(emberPositions, 3));
  const emberMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: 'void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=3.5;}',
    fragmentShader: 'void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(1.,.7,.26,1.-d);}',
  });
  const embers = new Points(emberGeometry, emberMaterial); embers.frustumCulled = false; group.add(embers);

  function addPickProxy(object: TerrainObject, action: ActionId, height: number) {
    const shape = object.shape;
    const mesh = new Mesh(shape.type === 'circle' ? shapes.cylinder : shapes.box, new MeshBasicMaterial());
    mesh.position.set(shape.center.x - 50, height / 2, shape.center.y - 50);
    mesh.scale.set(shape.type === 'circle' ? shape.radius : shape.half.x * 2, height, shape.type === 'circle' ? shape.radius : shape.half.y * 2);
    mesh.userData.action = action; mesh.updateMatrixWorld(); pickables.push(mesh);
  }

  return {
    group, markers, pickables,
    update(time, game, reducedMotion) {
      const strength = Math.max(0, Math.min(1, game.fire / 100));
      flames.visible = strength > .01; embers.visible = strength > .01;
      flames.scale.setScalar(.7 + strength * .35);
      for (let i = 0; i < flames.children.length; i++) {
        const flame = flames.children[i];
        const wave = reducedMotion ? 0 : Math.sin(time * (3.7 + i * .23) + flame.userData.phase);
        flame.scale.y = .78 + i % 3 * .11 + wave * .11;
        flame.rotation.z = wave * .07; flame.rotation.x = wave * .045;
      }
      light.intensity = strength * (215 + (reducedMotion ? 0 : Math.sin(time * 5.3) * 13));
      (glow.material as ShaderMaterial).uniforms.strength.value = strength * .32;
      const positions = emberGeometry.getAttribute('position');
      for (let i = 0; i < emberSeeds.length; i++) {
        const [a, b, c] = emberSeeds[i]; const age = reducedMotion ? b : (b + time * .19) % 1;
        positions.setXYZ(i, fx + Math.sin(a * TAU + age * 3) * (.6 + age * 1.6), .6 + age * 8, fz + Math.cos(a * TAU) * (.7 + age * .8) + c * .3);
      }
      positions.needsUpdate = true;
      if (water && !reducedMotion) {
        const wp = water.geometry.getAttribute('position');
        for (let i = 0; i < wp.count; i++) wp.setY(i, Math.sin(wp.getX(i) * 1.8 + wp.getZ(i) * .6 + time * 1.7) * .025);
        wp.needsUpdate = true;
        for (let i = 0; i < waterFoam.length; i++) waterFoam[i].position.z = waterFoam[i].userData.originZ + Math.sin(time * .5 + i) * .55;
      }
    },
  };
}
