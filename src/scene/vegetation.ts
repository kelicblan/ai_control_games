import { BufferGeometry, CylinderGeometry, DoubleSide, FrontSide, Group, Mesh } from 'three';
import type { MeshStandardMaterial } from 'three';
import { TERRAIN } from '../games/camp/simulation/campTerrain';
import type { GameState, Point } from '../games/camp/simulation/types';
import { material, seeded, Shapes, StaticBatch, TAU, triangleGeometry } from './geometry';
import type { WindRoot, XYZ } from './geometry';
import { detailNaturalMaterial } from './surfaceMaterials';
import { RootedWind } from './wind';

export interface WoodlandVegetationOptions {
  pathDistance: (gameX: number, gameY: number) => number;
  insideObject: (point: Point, margin?: number) => boolean;
  scatterTrees?:boolean;
}

/** A folded, narrow leaf has a lit ridge and a shaded underside from any camera angle. */
function leaf(points: number[], base: XYZ, tip: XYZ, width: number, fold: number) {
  const dx = tip[0] - base[0], dz = tip[2] - base[2];
  const inverse = 1 / Math.max(.0001, Math.hypot(dx, dz));
  const sx = dz * inverse * width, sz = -dx * inverse * width;
  const mx = base[0] + dx * .47, my = base[1] + (tip[1] - base[1]) * .47, mz = base[2] + dz * .47;
  const left: XYZ = [mx - sx, my, mz - sz], right: XYZ = [mx + sx, my, mz + sz];
  const ridge: XYZ = [mx, my + fold, mz];
  points.push(...base, ...left, ...ridge, ...base, ...ridge, ...right,
    ...left, ...tip, ...ridge, ...ridge, ...tip, ...right);
}

function ribbon(points: number[], centers: XYZ[], widths: number[], angle: number) {
  const sx = Math.cos(angle), sz = -Math.sin(angle);
  for (let i = 0; i < centers.length - 1; i++) {
    const a = centers[i], b = centers[i + 1], wa = widths[i], wb = widths[i + 1];
    const al: XYZ = [a[0] - sx * wa, a[1], a[2] - sz * wa];
    const ar: XYZ = [a[0] + sx * wa, a[1], a[2] + sz * wa];
    const bl: XYZ = [b[0] - sx * wb, b[1], b[2] - sz * wb];
    const br: XYZ = [b[0] + sx * wb, b[1], b[2] + sz * wb];
    points.push(...al, ...bl, ...ar);
    if (wb > 0) points.push(...ar, ...bl, ...br);
  }
}

function foldedNeedle(points: number[], base: XYZ, tip: XYZ, width: number) {
  const dx = tip[0] - base[0], dz = tip[2] - base[2], inverse = 1 / Math.max(.0001, Math.hypot(dx, dz));
  const mx = (base[0] + tip[0]) * .5, my = (base[1] + tip[1]) * .5 - .025, mz = (base[2] + tip[2]) * .5;
  points.push(...base, mx - dz * inverse * width, my, mz + dx * inverse * width, ...tip,
    ...base, ...tip, mx + dz * inverse * width, my, mz - dx * inverse * width);
}

/** Individual evergreen needles follow a drooping twig; no filled cone or foliage card. */
function needleSpray(seed: number, pairs: number) {
  const random = seeded(seed), points: number[] = [];
  // The many tiny needles also form a visible, folded branchlet at ordinary game zoom.
  // Four uneven sections provide its volume; separate tips break up both edges.
  const sections = [[0, .018, .025], [.24, .24, .12], [.48, .20, .06], [.76, .15, -.045], [1.06, .004, -.18]];
  for (let section = 0; section < sections.length - 1; section++) {
    const [az, aw, ay] = sections[section], [bz, bw, by] = sections[section + 1];
    const ca: XYZ = [Math.sin(az * 5 + seed) * .02, ay, az];
    const cb: XYZ = [Math.sin(bz * 5 + seed) * .02, by, bz];
    for (const side of [-1, 1]) {
      const ea: XYZ = [side * aw * (1 + Math.sin(seed + section * 2 + side) * .13), ay - aw * .78, az + side * .025];
      const eb: XYZ = [side * bw * (1 + Math.sin(seed + section * 2 + 2 + side) * .13), by - bw * .78, bz + side * .025];
      points.push(...ca, ...ea, ...cb, ...ea, ...eb, ...cb);
    }
  }
  ribbon(points, [[0, 0, 0], [0, .045, .45], [0, -.065, 1.04]], [.012, .009, 0], 0);
  for (let i = 0; i < pairs; i++) for (const side of [-1, 1]) {
    const t = .10 + i / pairs * .77 + random() * .035;
    const y = Math.sin(t * Math.PI) * .07 - t * .16;
    const length = (.34 + random() * .13) * (1 - t * .57);
    foldedNeedle(points, [0, y, t], [side * length, y - .08 - random() * .075, t + .15 + random() * .065],
      .045 + random() * .013);
  }
  foldedNeedle(points, [0, -.10, .83], [0, -.23, 1.22], .045);
  return triangleGeometry(points);
}

function grassTuft(seed: number) {
  const random = seeded(seed), points: number[] = [];
  for (let blade = 0; blade < 6; blade++) {
    const a = random() * TAU, h = .34 + random() * .43;
    const x = (random() - .5) * .58, z = (random() - .5) * .58;
    const lean = .12 + random() * .22, width = .033 + random() * .023;
    ribbon(points, [[x, 0, z], [x + Math.sin(a) * lean * .20, h * .46, z + Math.cos(a) * lean * .20],
      [x + Math.sin(a) * lean * .63, h * .84, z + Math.cos(a) * lean * .63],
      [x + Math.sin(a) * lean, h, z + Math.cos(a) * lean]], [width * .6, width, width * .65, 0], a + .28);
  }
  return triangleGeometry(points);
}

function fernFrond(seed: number) {
  const random = seeded(seed), points: number[] = [];
  const midrib = (t: number): XYZ => [Math.sin(t * 2.6) * .045, Math.sin(t * Math.PI * .71) * .66, t * 1.22];
  ribbon(points, [midrib(0), midrib(.25), midrib(.5), midrib(.75), midrib(1)], [.016, .013, .009, .005, 0], 0);
  for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
    const t = .15 + i * .105, base = midrib(t);
    const reach = (.29 + random() * .055) * Math.sin((t + .10) * Math.PI * .96);
    leaf(points, base, [base[0] + side * reach, base[1] - .055 + random() * .025, base[2] + .105], .075 * (1 - t * .58), .025);
  }
  leaf(points, midrib(.85), midrib(1.05), .027, .012);
  return triangleGeometry(points);
}

function cloverLeaves() {
  const points: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU, sx = Math.sin(a), sz = Math.cos(a);
    const center: XYZ = [sx * .18, .18, sz * .18];
    const outline: XYZ[] = [[0, .035, 0], [-.09, .005, .06], [-.12, 0, .16], [-.055, -.008, .22],
      [0, -.012, .18], [.055, -.008, .22], [.12, 0, .16], [.09, .005, .06]];
    const rim = outline.map(([x, y, z]): XYZ => [Math.cos(a) * x + sx * (z + .05), y + .17, -sx * x + sz * (z + .05)]);
    for (let j = 0; j < rim.length; j++) points.push(...center, ...rim[j], ...rim[(j + 1) % rim.length]);
    ribbon(points, [[0, 0, 0], [sx * .1, .17, sz * .1]], [.008, .004], a);
  }
  return triangleGeometry(points);
}

function wildflowerPetals() {
  const points: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    leaf(points, [0, 0, 0], [Math.sin(a) * .17, -.025, Math.cos(a) * .17], .047, .024);
  }
  return triangleGeometry(points);
}

function ridgedTrunk(seed: number, distant = false) {
  const random = seeded(seed), geometry = new CylinderGeometry(.045, 1, 1, distant ? 7 : 12, distant ? 4 : 12);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i), t = y + .5;
    const a = Math.atan2(z, x);
    const ridge = 1 + Math.sin(a * 6 + t * .7) * .105 + Math.cos(a * 3 - t * 1.2) * .045;
    const flare = 1 + Math.pow(1 - t, 5) * .30;
    positions.setXYZ(i, x * ridge * flare + Math.sin(t * 4 + seed) * .018 * t,
      y, z * ridge * flare + Math.sin(t * 3 + seed * .2) * .025 * t);
  }
  // The seed changes the gentle trunk lean, while identical radial seams remain watertight.
  geometry.rotateY(random() * TAU); geometry.computeVertexNormals();
  return geometry;
}

/** Render-only understory and conifers; collisions, paths and atmosphere stay authoritative. */
export function createWoodlandVegetation(shapes: Shapes, options: WoodlandVegetationOptions) {
  const group = new Group(); group.name = 'Detailed living woodland';
  const treeBatch = new StaticBatch(), plants = new StaticBatch(), litter = new StaticBatch();
  const wind = new RootedWind(), random = seeded(542781);
  const resources: BufferGeometry[] = [];
  const keep = <T extends BufferGeometry>(geometry: T) => { resources.push(geometry); return geometry; };
  const rootedMaterial = (color: string, name: string, twoSided = false) => {
    const source = material(color, { side: twoSided ? DoubleSide : FrontSide, roughness: .93 });
    const result = wind.material(source); source.dispose(); result.name = name; return result;
  };
  const bark = detailNaturalMaterial(rootedMaterial('#66503a', 'Ridged conifer bark'), 'bark');
  const twig = detailNaturalMaterial(rootedMaterial('#453e2d', 'Fine conifer twigs'), 'bark');
  const needles = ['#294b36', '#355d3b', '#4a713f', '#738b4e'].map((color, i) => rootedMaterial(color, `Evergreen needles ${i + 1}`, true));
  const greens = ['#486739', '#668345', '#88974f'].map((color, i) => rootedMaterial(color, `Woodland leaf greens ${i + 1}`, true));
  const petals = [rootedMaterial('#e3ddad', 'Small ivory wildflowers', true), rootedMaterial('#c7ad56', 'Small golden wildflowers', true)];
  const fallen = material('#796343', { side: DoubleSide }); fallen.name = 'Fallen pine needles and cones';
  const trunks = Array.from({ length: 3 }, (_, i) => keep(ridgedTrunk(229 + i)));
  const distantTrunks = Array.from({ length: 2 }, (_, i) => keep(ridgedTrunk(229 + i, true)));
  const limb = keep(new CylinderGeometry(.28, 1, 1, 5, 1, true));
  const distantLimb = keep(new CylinderGeometry(.28, 1, 1, 3, 1, true));
  const nearSprays = Array.from({ length: 4 }, (_, i) => keep(needleSpray(123 + i, 5)));
  const farSprays = Array.from({ length: 3 }, (_, i) => keep(needleSpray(217 + i, 2)));
  const grasses = Array.from({ length: 5 }, (_, i) => keep(grassTuft(61 + i)));
  const ferns = Array.from({ length: 3 }, (_, i) => keep(fernFrond(331 + i)));
  const clover = keep(cloverLeaves()), flower = keep(wildflowerPetals());
  const flowerStem = keep(triangleGeometry([-.007, 0, 0, .007, 0, 0, .034, .66, .017,
    .007, 0, 0, .049, .66, .017, .034, .66, .017]));
  const fallenNeedles = keep(triangleGeometry([-.004, 0, 0, .004, 0, 0, .075, .003, .32,
    -.004, .003, 0, .004, .003, 0, -.12, 0, .28]));

  const buildTree = (x: number, z: number, radius: number, height: number, seed: number, detailed: boolean) => {
    const rng = seeded(seed), root: WindRoot = [x, z, height, x * .31 + z * .19 + seed];
    const trunkRadius = radius * (detailed ? .43 : .48);
    const trunkShapes = detailed ? trunks : distantTrunks, branchShape = detailed ? limb : distantLimb;
    treeBatch.add(trunkShapes[seed % trunkShapes.length], bark, [x, height * .495 - .035, z], [trunkRadius, height * .99, trunkRadius], [0, rng() * TAU, 0], root);
    const rootCount = detailed ? 5 : 3;
    for (let k = 0; k < rootCount; k++) {
      const a = k / rootCount * TAU + rng() * .4;
      treeBatch.branch(branchShape, bark, [x, .70, z], [x + Math.sin(a) * radius * .93, .025, z + Math.cos(a) * radius * .93], trunkRadius * .28, 1, root);
    }
    const levels = detailed ? 9 : 6, phase = rng() * TAU;
    for (let tier = 0; tier < levels; tier++) {
      const t = tier / (levels - 1), y = height * (.17 + t * .73);
      const count = detailed ? 5 - tier % 2 : 4;
      const spread = height * (detailed ? .28 : .255) * Math.pow(1 - t * .925, .66);
      for (let branch = 0; branch < count; branch++) {
        const a = phase + tier * 1.83 + branch / count * TAU + (rng() - .5) * .30;
        const length = spread * (.79 + rng() * .24), sy = y + (rng() - .5) * height * .023;
        const dx = Math.sin(a), dz = Math.cos(a);
        const mid: XYZ = [x + dx * length * .55, sy - length * .12, z + dz * length * .55];
        const end: XYZ = [x + dx * length, sy - length * .075, z + dz * length];
        const branchRadius = (detailed ? .087 : .062) * (1 - t * .7);
        treeBatch.branch(branchShape, twig, [x, sy, z], detailed ? mid : end, branchRadius, 1, root);
        if (detailed) treeBatch.branch(limb, twig, mid, end, branchRadius * .50, 1, root);
        const sprays = detailed ? 4 : 1;
        for (let sprig = 0; sprig < sprays; sprig++) {
          const terminal = sprig === sprays - 1;
          const along = detailed ? (terminal ? .39 : .055 + sprig * .19) : .10;
          const offset = terminal ? 0 : (sprig === 0 ? -1 : 1) * (sprig === 2 ? -.30 : .56 + rng() * .10);
          const sprigAngle = a + offset;
          const sprigLength = length * (terminal ? (detailed ? .66 : .83) : .59);
          const start: XYZ = [x + dx * length * along, sy - length * along * .16, z + dz * length * along];
          const shade = terminal && rng() > .60 ? 3 : (tier + branch + sprig + seed) % 3;
          if (detailed && !terminal) treeBatch.branch(limb, twig, start,
            [start[0] + Math.sin(sprigAngle) * sprigLength * .88, start[1] - sprigLength * .05,
              start[2] + Math.cos(sprigAngle) * sprigLength * .88], branchRadius * .39, 1, root);
          treeBatch.add(detailed ? nearSprays[(tier + sprig + seed) % nearSprays.length] : farSprays[(branch + seed) % farSprays.length],
            needles[shade], start, [sprigLength * (detailed ? 1.70 : 1.85), sprigLength * 1.6, sprigLength],
            [.025 + rng() * .085, sprigAngle, (rng() - .5) * .17], root);
        }
      }
    }
    // Several overlapping leader sprays cover the upper trunk without a solid conical cap.
    const leaders = detailed ? 9 : 3;
    for (let i = 0; i < leaders; i++) {
      const level = detailed ? Math.floor(i / 3) : i;
      treeBatch.add(farSprays[(seed + i) % farSprays.length], needles[(seed + i) % 3],
        [x, height * (.90 + level * .035), z], [1.18 - level * .23, 1.4, 1.28 - level * .22],
        [-.8, phase + i * 2.2, 0], root);
    }
    // A few broken lower limbs give the exposed bases distinct ages and silhouettes.
    if (detailed) for (let i = 0; i < 2; i++) {
      const a = phase + i * 2.6;
      treeBatch.branch(limb, twig, [x, height * (.12 + i * .032), z],
        [x + Math.sin(a) * radius * 1.25, height * (.12 + i * .032) - .25, z + Math.cos(a) * radius * 1.25], .06, 1, root);
    }
  };

  let treeIndex = 0;
  for (const object of TERRAIN) if (object.kind === 'tree' && object.shape.type === 'circle') {
    const { center, radius } = object.shape;
    buildTree(center.x - 50, center.y - 50, radius, 16 + radius * 2.1, 131 + treeIndex++ * 17, true);
  }
  // As before, distant scenery stays outside the navigable square and the entire creek corridor.
  const sceneryRandom = seeded(749261), creek = TERRAIN.find(object => object.kind === 'water')!.shape;
  for (let i = 0; i < (options.scatterTrees===false?0:94); i++) {
    const side = i % 4, edge = 54 + sceneryRandom() * 32, along = (sceneryRandom() - .5) * 174;
    const x = side === 0 ? -edge : side === 1 ? edge : along;
    const z = side === 2 ? -edge : side === 3 ? edge : along;
    const height = (z > 50 ? 11 : 16) + sceneryRandom() * 12;
    if (creek.type === 'aabb' && Math.abs(x + 50 - creek.center.x) < creek.half.x + height * .29 + 2) continue;
    buildTree(x, z, .8 + sceneryRandom() * .55, height, 713 + i * 19, false);
  }

  const allowed = (gx: number, gy: number, clearance: number) => gx > .4 && gx < 99.6 && gy > .4 && gy < 99.6
    && options.pathDistance(gx, gy) >= clearance && !options.insideObject({ x: gx, y: gy }, .45);
  const rootAt = (gx: number, gy: number, height = 1.1): WindRoot => [gx - 50, gy - 50, height, gx * .43 + gy * .29];
  // Plants spread from shared patches, leaving irregular soil gaps instead of a dotted lawn.
  // The tuft cap bounds geometry even when a caller supplies very permissive clearances.
  let tuftCount = 0;
  for (let patch = 0; patch < 370 && tuftCount < 1500; patch++) {
    const centerX = random() * 100, centerY = random() * 100;
    if (!allowed(centerX, centerY, 3.6)) continue;
    const clearing = Math.hypot(centerX - 51, centerY - 56);
    const density = .79 + Math.sin(centerX * .18) * Math.cos(centerY * .15) * .16 - (clearing < 19 ? .48 : 0);
    if (random() > density) continue;
    const spread = 1.1 + random() * 1.5, count = 6 + Math.floor(random() * 4);
    for (let tuft = 0; tuft < count && tuftCount < 1500; tuft++) {
      const angle = random() * TAU, radius = tuft === 0 ? 0 : Math.sqrt(random()) * spread;
      const gx = centerX + Math.sin(angle) * radius, gy = centerY + Math.cos(angle) * radius;
      if (!allowed(gx, gy, 2.7)) continue;
      const scale = .95 + random() * .65, root = rootAt(gx, gy, 1.55);
      plants.add(grasses[tuftCount % grasses.length], greens[(patch + tuft) % greens.length],
        [gx - 50, .018, gy - 50], [scale, scale, scale], [0, random() * TAU, 0], root);
      if (tuftCount % 10 === 0) plants.add(clover, greens[1], [gx - 50, .02, gy - 50], [1.15, 1, 1.15], [0, random() * TAU, 0], root);
      tuftCount++;
    }
  }
  for (let i = 0; i < 78; i++) {
    const a = random() * TAU, radius = 22 + random() * 25;
    const gx = 51 + Math.sin(a) * radius, gy = 56 + Math.cos(a) * radius * .91;
    if (!allowed(gx, gy, 3.7)) continue;
    const size = 1.15 + random() * .65, root = rootAt(gx, gy, 1.8);
    for (let frond = 0; frond < 5; frond++) plants.add(ferns[(frond + i) % ferns.length], greens[(frond + i) % 2],
      [gx - 50, .023, gy - 50], [size, size, size], [.08 * Math.sin(frond), a + frond / 5 * TAU + random() * .3, 0], root);
  }
  for (let i = 0; i < 72; i++) {
    const gx = 12 + random() * 78, gy = 17 + random() * 73;
    if (!allowed(gx, gy, 3.2)) continue;
    const root = rootAt(gx, gy), scale = .72 + random() * .38;
    plants.add(clover, greens[1], [gx - 50, .02, gy - 50], [1, .8, 1], [0, random() * TAU, 0], root);
    plants.add(flowerStem, greens[0], [gx - 50, .02, gy - 50], [scale, scale, scale], [0, 0, 0], root);
    plants.add(flower, petals[i % 2], [gx - 50 + .04 * scale, .02 + .66 * scale, gy - 50 + .017 * scale], [scale, scale, scale], [.08, random() * TAU, .08], root);
    plants.add(shapes.flower, petals[(i + 1) % 2], [gx - 50 + .04 * scale, .033 + .66 * scale, gy - 50 + .017 * scale], [.038, .025, .038], [0, 0, 0], root);
  }
  for (let i = 0; i < 770; i++) {
    const gx = random() * 100, gy = random() * 100;
    if (options.insideObject({ x: gx, y: gy }, .1)) continue;
    const size = .6 + random() * 1.0;
    litter.add(fallenNeedles, fallen, [gx - 50, .014, gy - 50], [size, 1, size], [0, random() * TAU, 0]);
    if (i % 14 === 0) litter.add(shapes.pebble, fallen, [gx - 50, .075, gy - 50], [.065, .075, .13], [random() * .5, random() * TAU, .2]);
  }

  const forest = treeBatch.finish('Rooted trunks, branches and pine crowns');
  const understory = plants.finish('Fine grasses, ferns and woodland flowers', false);
  for (const rooted of [forest, understory]) rooted.traverse(object => {
    if (object instanceof Mesh) { object.customDepthMaterial = wind.depth; object.customDistanceMaterial = wind.distance; }
  });
  group.add(forest, understory, litter.finish('Fallen pine needles and forest litter', false));
  resources.forEach(geometry => geometry.dispose());
  const wetMaterials: MeshStandardMaterial[] = [...needles, ...greens, ...petals];
  return {
    group,
    update(time: number, game: GameState, reducedMotion: boolean) {
      wind.update(time, game.atmosphere, reducedMotion);
      const rain = game.atmosphere.rainIntensity;
      for (const mat of wetMaterials) mat.roughness = .93 - rain * .18;
    },
  };
}
