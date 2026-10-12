import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group,
  LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  PlaneGeometry, PointLight, ShaderMaterial, Vector2, Vector3,
} from 'three';
import { LOCATIONS } from '../game/constants';
import { SHELTER_COVER, TERRAIN } from '../game/terrain';
import type { TerrainObject } from '../game/terrain';
import type { ActionId, GameState, Point } from '../game/types';
import { addMesh, material, pineBough, seeded, Shapes, StaticBatch, TAU, triangleGeometry, vertexTint } from './geometry';
import type { WindRoot, XYZ } from './geometry';
import { createFirePlume } from './firePlume';
import { createRiverSurface } from './water';
import { RootedWind } from './wind';

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
  const trees = new StaticBatch(), treeWind = new RootedWind();
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
  const emberCold = new Color('#4c3b2a'), emberHot = new Color('#ff9a29');
  const treePalette = {
    bark: treeWind.material(palette.bark), dark: treeWind.material(palette.barkDark),
    pine: palette.pine.map(mat => treeWind.material(mat)),
  };
  const canvasDry = new Color('#dfc999'), canvasWet = new Color('#aaab94');
  const cloth: { mesh: Mesh; base: Float32Array; weights: Float32Array; flexibility: number }[] = [];
  const addCanvas = (geometry: BufferGeometry, mat: MeshStandardMaterial, position: XYZ,
    weightAt: (x: number, y: number, z: number) => number, flexibility = 1) => {
    const mesh = addMesh(group, geometry, mat, position);
    const positions = geometry.getAttribute('position'), weights = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) weights[i] = Math.max(0, weightAt(positions.getX(i), positions.getY(i), positions.getZ(i)));
    cloth.push({ mesh, base: new Float32Array(positions.array), weights, flexibility });
    return mesh;
  };
  const boughs = Array.from({ length: 4 }, (_, i) => pineBough(119 + i));
  const treeTrunk = new CylinderGeometry(.62, 1, 1, 10, 8);

  // A vertex-coloured ground mesh keeps soil, paths and moss dimensional without an image backdrop.
  const land = new PlaneGeometry(280, 280, 112, 112); land.rotateX(-Math.PI / 2);
  const p = land.getAttribute('position');
  const creek = TERRAIN.find(object => object.kind === 'water')!;
  const cs = creek.shape;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const outside = Math.max(Math.abs(x) - 50, Math.abs(z) - 50, 0);
    let height = outside > 0 ? Math.min(4.5, outside * .09) * (.55 + Math.sin(x * .055) * Math.cos(z * .08) * .3) : -.045;
    if (cs.type === 'aabb') {
      const bankDistance = Math.max(0, Math.abs(x + 50 - cs.center.x) - cs.half.x);
      if (Math.abs(z + 50 - cs.center.y) < cs.half.y && bankDistance < 4) {
        height = height * Math.min(1, bankDistance / 4) - .32 * Math.max(0, 1 - bankDistance / 2.8);
      }
    }
    p.setY(i, height);
  }
  land.computeVertexNormals();
  vertexTint(land, (x, _y, z) => {
    const d = pathDistance(x + 50, z + 50);
    const noise = Math.sin(x * .19 + z * .13) * Math.cos(x * .11 - z * .18) * .012;
    const soil = new Color('#927044'), moss = new Color('#3b4e27');
    const clearing = Math.hypot(x - 1, z - 5) < 30 ? .24 : 0;
    const blend = Math.max(clearing, Math.max(0, 1 - d / 5.6));
    moss.lerp(soil, blend);
    if (cs.type === 'aabb' && Math.abs(z + 50 - cs.center.y) < cs.half.y) {
      const bankDistance = Math.abs(Math.abs(x + 50 - cs.center.x) - cs.half.x);
      moss.lerp(soil, Math.max(0, 1 - bankDistance / 3.2) * .72);
    }
    return moss.offsetHSL(0, 0, noise);
  });
  const ground = new Mesh(land, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; ground.name = 'Continuous modeled earth'; group.add(ground);

  const buildPine = (x: number, z: number, radius: number, height: number, variant: number, detailed = true) => {
    const root: WindRoot = [x, z, height, x * .31 + z * .19 + variant];
    trees.add(treeTrunk, treePalette.bark, [x, height * .42, z], [radius, height * .84, radius], [0, 0, 0], root);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU + variant;
      trees.branch(shapes.taper, treePalette.dark, [x, .7, z], [x + Math.cos(a) * radius, .08, z + Math.sin(a) * radius], radius * .27, 1, root);
    }
    for (let k = 0; k < 7; k++) {
      const y = height * (.28 + k * .092);
      const spread = height * .28 * (1 - k * .11);
      trees.add(boughs[(variant + k) % boughs.length], treePalette.pine[(variant + k) % 4], [x, y, z], [spread, height * .19, spread], [0, k * .82 + variant, 0], root);
      if (detailed && k < 5) for (let j = 0; j < 4; j++) {
        const a = j / 4 * TAU + k * 1.4;
        const end: XYZ = [x + Math.cos(a) * spread * .8, y - .3, z + Math.sin(a) * spread * .8];
        trees.branch(shapes.taper, treePalette.dark, [x, y + .45, z], end, .13 + (4 - k) * .025, 1, root);
        trees.add(shapes.rock, treePalette.pine[(j + k + 2) % 4], end, [spread * .27, .42, spread * .39], [0, -a, .1], root);
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
      const roof = new PlaneGeometry(hx * 2, hz * 2, 20, 12); roof.rotateX(-Math.PI / 2);
      const roofPositions = roof.getAttribute('position');
      for (let i = 0; i < roofPositions.count; i++) roofPositions.setY(i, height * (1 - Math.abs(roofPositions.getX(i)) / hx));
      roof.computeVertexNormals();
      addCanvas(roof, palette.cream, [x, .08, z], (px, _py, pz) => {
        const seamDistance = Math.min(Math.abs(pz + hz * .6), Math.abs(pz - hz * .1), Math.abs(pz - hz * .75));
        return Math.sin(Math.PI * Math.abs(px) / hx) * Math.sin(Math.PI * (pz + hz) / (hz * 2)) * Math.min(1, seamDistance / .35);
      }, .7).name = 'Pitched canvas with pinned ridge and seams';
      const back = triangleGeometry([-hx, 0, -hz, hx, 0, -hz, 0, height, -hz]);
      batch.add(back, palette.canvasShadow, [x, .05, z]); back.dispose();
      const entrance = triangleGeometry([
        -hx, 0, hz, -1.7, .12, hz + .05, 0, height, hz,
        1.7, .12, hz + .05, hx, 0, hz, 0, height, hz,
      ]);
      addCanvas(entrance, palette.canvasShadow, [x, .07, z], (px, py) => py < .2 && Math.abs(px) < hx - .2 ? 1 : 0, 1.3).name = 'Loose tent entrance flaps';
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
      markers.push({ id: 'rest', action: 'rest', name: '休息区', point: new Vector3(SHELTER_COVER.center.x - 50, 9.7, SHELTER_COVER.center.y - 50) });
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

  // This open awning covers the actual rest stations. Its supports stay outside the walking slots.
  const sx = SHELTER_COVER.center.x - 50, sz = SHELTER_COVER.center.y - 50;
  const { x: shx, y: shz } = SHELTER_COVER.half;
  const awning = new PlaneGeometry(shx * 2, shz * 2, 18, 12); awning.rotateX(-Math.PI / 2);
  const awningPositions = awning.getAttribute('position');
  for (let i = 0; i < awningPositions.count; i++) {
    const across = (awningPositions.getX(i) + shx) / (shx * 2), along = (awningPositions.getZ(i) + shz) / (shz * 2);
    awningPositions.setY(i, 8.5 - along * .85 - Math.sin(across * Math.PI) * Math.sin(along * Math.PI) * .25);
  }
  awning.computeVertexNormals();
  addCanvas(awning, palette.cream, [sx, 0, sz], (x, _y, z) => Math.sin(Math.PI * (x + shx) / (shx * 2)) * Math.sin((z + shz) / (shz * 2) * Math.PI * .68), 1.25).name = 'Rest shelter canvas awning';
  const valance = new PlaneGeometry(shx * 2, .62, 18, 2);
  addCanvas(valance, palette.canvasShadow, [sx, 7.35, sz + shz], (x, y) => Math.sin(Math.PI * (x + shx) / (shx * 2)) * (.31 - y) / .62, 1.5).name = 'Fluttering awning hem';
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const roofHeight = end < 0 ? 8.5 : 7.65;
    const px = sx + side * (shx + .16), pz = sz + end * (shz + .08);
    batch.add(shapes.taper, palette.barkLight, [px, roofHeight / 2, pz], [.09, roofHeight + .25, .09]);
    batch.add(shapes.sphere, palette.cut, [px, roofHeight + .18, pz], [.13, .13, .13]);
    batch.branch(shapes.cylinder, palette.rope, [px, roofHeight, pz], [sx + side * shx, roofHeight, sz + end * shz], .027);
  }
  for (const side of [-1, 1]) batch.branch(shapes.cylinder, palette.rope, [sx + side * shx, 8.5, sz - shz], [sx + side * shx, 7.65, sz + shz], .027);
  const awningPick = new Mesh(shapes.box, new MeshBasicMaterial());
  awningPick.position.set(sx, 8, sz); awningPick.scale.set(shx * 2, .3, shz * 2);
  awningPick.userData.action = 'rest'; awningPick.updateMatrixWorld(); pickables.push(awningPick);

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
    // Leave the whole river corridor open, including its distant continuation and swaying crowns.
    if (cs.type === 'aabb' && Math.abs(x + 50 - cs.center.x) < cs.half.x + height * .29 + 2) continue;
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

  // Water, banks and the carved ground all follow the same full-length hazard footprint.
  let river: ReturnType<typeof createRiverSurface> | null = null;
  if (cs.type === 'aabb') {
    const x = cs.center.x - 50, z = cs.center.y - 50;
    river = createRiverSurface({ centerX: x, centerZ: z, halfWidth: cs.half.x, halfLength: cs.half.y });
    group.add(river.group);
    for (let k = 0; k < 180; k++) for (const side of [-1, 1]) {
      const zz = z - cs.half.y + (k + .5) / 180 * cs.half.y * 2;
      low.add(shapes.pebble, k % 3 === 0 ? palette.rock : palette.rockDark,
        [x + side * (cs.half.x - .12 + (random() - .5) * .36), .13, zz],
        [.22 + random() * .35, .12 + random() * .16, .32 + random() * .58], [.1, random(), .2]);
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

  const forest = trees.finish('Rooted trunks, branches and pine crowns');
  forest.traverse(object => {
    if (object instanceof Mesh) {
      object.customDepthMaterial = treeWind.depth;
      object.customDistanceMaterial = treeWind.distance;
    }
  });
  group.add(forest);
  group.add(batch.finish('Camp props and shelter supports'));
  group.add(low.finish('Grass, wildflowers and ground details', false));
  boughs.forEach(geometry => geometry.dispose()); treeTrunk.dispose();

  const flameShape = new LatheGeometry([new Vector2(0, 0), new Vector2(.7, .2), new Vector2(.86, .8), new Vector2(.64, 1.6), new Vector2(.35, 2.5), new Vector2(0, 3.8)], 12);
  const flames = new Group(); flames.name = 'Modeled dancing flames'; flames.position.set(fx, .3, fz); group.add(flames);
  const flameMaterials = [
    new MeshBasicMaterial({ color: '#ff7629', transparent: true, opacity: .93, depthWrite: false }),
    new MeshBasicMaterial({ color: '#ffbc3e', transparent: true, opacity: .96, depthWrite: false }),
    new MeshBasicMaterial({ color: '#ffe295', depthWrite: false }),
  ];
  const flameWind = { value: new Vector2() };
  for (const mat of flameMaterials) {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uFlameWind = flameWind;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uFlameWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.xz += uFlameWind * max(0.0, position.y) * max(0.0, position.y) * 0.15;
        `);
    };
    mat.customProgramCacheKey = () => 'campmind-buoyant-flame-v1';
  }
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

  const plume = createFirePlume(fx, fz); group.add(plume.group);

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
      const weather = game.atmosphere, wind = weather.windStrength, rain = weather.rainIntensity;
      const wx = Math.cos(weather.windAngle), wz = Math.sin(weather.windAngle);
      treeWind.update(time, weather, reducedMotion);
      const wear = 1 - Math.max(0, Math.min(1, game.shelterIntegrity / 100));
      palette.cream.color.copy(canvasDry).lerp(canvasWet, rain * .6 + wear * .15);
      const earthMaterial = ground.material as MeshStandardMaterial;
      earthMaterial.roughness = 1 - rain * .42;
      earthMaterial.color.setRGB(1 - rain * .18, 1 - rain * .16, 1 - rain * .12);
      for (const surface of cloth) {
        const positions = surface.mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const baseIndex = i * 3, weight = surface.weights[i];
          const x = surface.base[baseIndex], y = surface.base[baseIndex + 1], z = surface.base[baseIndex + 2];
          const flutter = reducedMotion ? 0 : Math.sin(time * 5.8 + x * 1.3 + z * .75) + Math.sin(time * 10.3 + z * 2.1) * .3;
          const amount = weight * surface.flexibility;
          positions.setXYZ(i, x + wx * wind * amount * (.19 + flutter * .055),
            y + flutter * (.025 + wind * .14) * amount - (rain * .035 + wear * .18) * amount,
            z + wz * wind * amount * (.19 + flutter * .055));
        }
        positions.needsUpdate = true; surface.mesh.geometry.computeVertexNormals();
      }
      const strength = Math.max(0, Math.min(1, game.fire / 100));
      flames.visible = strength > .005;
      const flameSize = Math.sqrt(strength) * 1.06;
      flames.scale.set(flameSize, flameSize * (1 - rain * .30), flameSize);
      flameWind.value.set(wx, wz).multiplyScalar(wind);
      for (let i = 0; i < flames.children.length; i++) {
        const flame = flames.children[i];
        const wave = reducedMotion ? 0 : Math.sin(time * (3.7 + i * .23) + flame.userData.phase);
        flame.scale.y = .78 + i % 3 * .11 + wave * (.11 + wind * .13);
        flame.rotation.z = -wx * wave * (.035 + wind * .055); flame.rotation.x = wz * wave * (.035 + wind * .055);
      }
      light.intensity = strength * (1 - rain * .22) * (215 + (reducedMotion ? 0 : Math.sin(time * 5.3) * (13 + wind * 22)));
      (glow.material as ShaderMaterial).uniforms.strength.value = strength * (1 - rain * .26) * .32;
      palette.ember.emissiveIntensity = strength * (1 - rain * .4) * 2.2;
      palette.ember.color.copy(emberCold).lerp(emberHot, strength);
      plume.update(time, game.fire, weather, reducedMotion);
      river?.update(time, weather, reducedMotion);
    },
  };
}
