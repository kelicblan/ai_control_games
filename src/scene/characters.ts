import { Color, Group, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three';
import { NPC_RADIUS, SHELTER_COVER } from '../games/camp/simulation/terrain';
import { isWalkable } from '../games/camp/simulation/physics';
import type { Atmosphere, Npc, NpcId } from '../games/camp/simulation/types';
import { addMesh, material, Shapes, StaticBatch, TAU, triangleGeometry } from './geometry';

export interface CompanionRig {
  id: NpcId; root: Group; pivot: Group; torso: Group; head: Group;
  arms: [Group, Group]; forearms: [Group, Group]; legs: [Group, Group];
  axe: Group; bundle: Group; ring: Group;
  warmMaterials: MeshStandardMaterial[];
  dryColors: Color[]; dryRoughness: number[];
  lastPosition: Vector3; yaw: number; initialized: boolean; gait: number; wasMoving: boolean;
}

/** Sculpted, jointed companions. The whole body is geometry, including their faces. */
export function createCompanion(id: NpcId, shapes: Shapes): CompanionRig {
  const young = id === 'azhuang', woman = id === 'xiaomi', principled = id === 'linlan', explorer = id === 'aye';
  const style = {
    azhuang: { coat: '#64705a', shade: '#475544', pants: '#485044', skin: '#dfa67c', hair: '#332820', scarf: '#dcae42', ring: '#f3c76a', height: 1.08 },
    xiaomi: { coat: '#c4ba96', shade: '#a49676', pants: '#58604b', skin: '#edba91', hair: '#3b2d29', scarf: '#4c9690', ring: '#82c7b5', height: 1.04 },
    laozhou: { coat: '#8b7456', shade: '#665741', pants: '#58604b', skin: '#ce9d78', hair: '#79796b', scarf: '#8d5576', ring: '#c490b7', height: 1.08 },
    linlan: { coat: '#9b645a', shade: '#74473e', pants: '#424d51', skin: '#e3b18b', hair: '#352e2a', scarf: '#cbd0b2', ring: '#d99b89', height: 1.07 },
    aye: { coat: '#427d77', shade: '#2a5c56', pants: '#6d6750', skin: '#d7a47a', hair: '#3d3127', scarf: '#d4b36d', ring: '#91c3d1', height: 1.02 },
  }[id];
  const root = new Group(); root.name = `Companion ${id}`; root.userData.npcId = id;
  const pivot = new Group(), torso = new Group(), head = new Group(); root.add(pivot); pivot.add(torso);
  const coat = material(style.coat);
  const coatShade = material(style.shade);
  const pants = material(style.pants);
  const skin = material(style.skin, { roughness: .77 });
  const blush = material('#d89479', { roughness: .86 });
  const hair = material(style.hair);
  const scarf = material(style.scarf);
  const leather = material('#6e4c2f'), leatherDark = material('#4b3929');
  const cream = material('#daceac'), buckle = material('#c5ab68', { metalness: .5, roughness: .5 });
  const eye = material('#2a2820'), whites = material('#fff0d3'), shoes = material('#473c2c');
  const steel = material('#9fa393', { metalness: .54, roughness: .48 });
  const warmMaterials = [coat, coatShade, pants, skin, blush, hair, scarf, leather, leatherDark, cream, shoes];

  const body = new StaticBatch();
  body.add(shapes.smoothSphere, coat, [0, 3.35, 0], [.78, 1.3, .57]);
  body.add(shapes.sphere, coatShade, [0, 2.4, -.01], [.77, .52, .57]);
  body.add(shapes.sphere, pants, [0, 2.12, 0], [.69, .38, .47]);
  body.add(shapes.cylinder, skin, [0, 4.69, 0], [.31, .5, .3]);
  // A raised central seam, soft coat pockets, belt and sherpa collar add readable scale.
  body.add(shapes.box, coatShade, [0, 3.35, .553], [.075, 1.72, .05]);
  for (const side of [-1, 1]) {
    body.add(shapes.sphere, coatShade, [side * .42, 2.93, .47], [.29, .34, .13]);
    body.add(shapes.box, cream, [side * .31, 4.23, .36], [.36, .6, .16], [0, 0, side * -.48]);
    body.add(shapes.box, leather, [side * .53, 3.73, .4], [.14, 1.88, .12], [0, 0, side * .035]);
    body.add(shapes.box, buckle, [side * .53, 3.65, .478], [.19, .21, .055]);
  }
  body.add(shapes.sphere, leatherDark, [0, 2.66, 0], [.802, .13, .59]);
  body.add(shapes.box, buckle, [0, 2.66, .61], [.28, .23, .07]);
  for (let i = 0; i < 3; i++) body.add(shapes.sphere, buckle, [.09, 3.05 + i * .36, .57], [.055, .055, .028]);
  const scarfRing = new TorusGeometry(.42, .16, 8, 20);
  body.add(scarfRing, scarf, [0, 4.65, .05], [1.2, 1, 1], [Math.PI / 2, 0, .05]); scarfRing.dispose();
  body.add(shapes.capsule, scarf, [young ? -.2 : .22, 4.02, .61], [.23, .47, .11], [0, 0, young ? -.22 : .23]);
  body.add(shapes.capsule, scarf, [.06, 4.23, .62], [.2, .35, .11], [.08, 0, -.11]);

  // Curved backpack, flap, straps and rolled blanket remain separate modeled surfaces.
  body.add(shapes.sphere, leather, [0, 3.52, -.71], [.74, .91, .35]);
  body.add(shapes.sphere, leatherDark, [0, 3.94, -.91], [.7, .37, .14]);
  body.add(shapes.sphere, coatShade, [0, 3.22, -1.01], [.45, .37, .13]);
  body.add(shapes.cylinder, cream, [0, 4.51, -.73], [.31, 1.61, .31], [0, 0, Math.PI / 2]);
  for (const side of [-1, 1]) {
    body.add(shapes.box, leatherDark, [side * .48, 4.52, -.43], [.11, .56, .07]);
    body.add(shapes.box, leather, [side * .3, 3.62, -1.064], [.1, 1.24, .065]);
    body.add(shapes.box, buckle, [side * .3, 3.56, -1.107], [.15, .17, .045]);
  }
  torso.add(body.finish(`${id} clothing and pack`));

  head.position.set(0, 4.75, .02); torso.add(head);
  const face = new StaticBatch();
  face.add(shapes.smoothSphere, skin, [0, .87, 0], [.81, .92, .72]);
  for (const side of [-1, 1]) {
    face.add(shapes.sphere, skin, [side * .82, .83, -.025], [.135, .22, .15]);
    face.add(shapes.sphere, blush, [side * .45, .53, .586], [.16, .09, .045]);
    face.add(shapes.sphere, whites, [side * .285, .925, .66], [.142, .171, .08]);
    face.add(shapes.sphere, eye, [side * .276, .916, .733], [.077, .106, .038]);
    face.add(shapes.sphere, whites, [side * .276 - .027, .95, .765], [.028, .032, .019]);
    face.branch(shapes.cylinder, hair, [side * .18, 1.17, .659], [side * .41, 1.14, .594], .041);
  }
  face.add(shapes.sphere, skin, [0, .7, .767], [.12, .17, .16]);
  const smile = new TorusGeometry(.17, .022, 5, 12, Math.PI * .74);
  face.add(smile, leatherDark, [.115, .43, .663], [1, .62, .6], [0, 0, Math.PI * 1.13]); smile.dispose();

  if (young || woman || principled || explorer) {
    face.add(shapes.halfSphere, hair, [0, 1.11, -.06], [.86, .89, .78], [-.12, 0, 0]);
    for (let i = 0; i < 6; i++) face.add(shapes.capsule, hair, [-.64 + i * .235, 1.43 - Math.abs(i - 2.7) * .06, .49], [.23, .25 + (i % 2) * .075, .23], [0, -.1, -.6 + i * .19]);
    for (const side of [-1, 1]) face.add(shapes.capsule, hair, [side * .73, .99, .12], [.16, .26, .19], [.05, 0, side * .13]);
    if (principled) {
      for (const side of [-1, 1]) {
        face.add(shapes.capsule, hair, [side * .75, .6, -.04], [.19, .47, .28]);
        const lens = new TorusGeometry(.19, .024, 6, 16);
        face.add(lens, leatherDark, [side * .285, .925, .79], [1, .83, 1]); lens.dispose();
      }
      face.branch(shapes.cylinder, leatherDark, [-.09, .925, .79], [.09, .925, .79], .018);
    }
    if (explorer) {
      const cap = material('#be9850'); warmMaterials.push(cap);
      face.add(shapes.halfSphere, cap, [0, 1.35, -.04], [.89, .7, .8]);
      face.add(shapes.sphere, cap, [.25, 1.36, .68], [.78, .08, .57], [0, 0, -.08]);
    }
    if (woman) {
      face.add(shapes.sphere, hair, [.18, 1.32, -.86], [.43, .35, .41]);
      face.add(shapes.capsule, hair, [.27, .78, -1.02], [.29, .46, .3], [.16, -.2, -.12]);
      face.add(shapes.sphere, scarf, [.2, 1.26, -.81], [.37, .1, .3]);
    }
  } else {
    const hat = material('#716147'); warmMaterials.push(hat);
    face.add(shapes.halfSphere, hat, [0, 1.31, -.04], [.91, .81, .81]);
    face.add(shapes.cylinder, hat, [0, 1.28, -.04], [.92, .31, .82]);
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU;
      face.add(shapes.cylinder, leatherDark, [Math.sin(a) * .922, 1.28, -.04 + Math.cos(a) * .818], [.012, .27, .012]);
    }
    for (let i = 0; i < 7; i++) face.add(shapes.sphere, hair, [-.6 + i * .2, .31 - Math.sin(i / 6 * Math.PI) * .16, .48], [.21, .34, .22]);
    for (const side of [-1, 1]) face.add(shapes.capsule, hair, [side * .21, .55, .691], [.105, .22, .1], [0, 0, side * 1.17]);
  }
  head.add(face.finish(`${id} face, hair and headwear`));

  const arms: [Group, Group] = [new Group(), new Group()];
  const forearms: [Group, Group] = [new Group(), new Group()];
  const legs: [Group, Group] = [new Group(), new Group()];
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const arm = arms[i], forearm = forearms[i], leg = legs[i];
    arm.position.set(side * .88, 4.24, .015); torso.add(arm);
    addMesh(arm, shapes.capsule, coat, [0, -.34, 0], [.32, .45, .32]);
    forearm.position.set(0, -.77, 0); arm.add(forearm);
    addMesh(forearm, shapes.capsule, coatShade, [0, -.24, .04], [.285, .32, .29]);
    addMesh(forearm, shapes.cylinder, cream, [0, -.56, .04], [.29, .22, .29]);
    addMesh(forearm, shapes.sphere, skin, [0, -.77, .08], [.25, .29, .24]);
    addMesh(forearm, shapes.sphere, skin, [-side * .19, -.71, .16], [.115, .16, .11]);
    leg.position.set(side * .4, 2.04, 0); pivot.add(leg);
    addMesh(leg, shapes.capsule, pants, [0, -.6, 0], [.41, .58, .41]);
    addMesh(leg, shapes.sphere, coatShade, [0, -.76, .27], [.29, .32, .095]);
    addMesh(leg, shapes.capsule, shoes, [0, -1.6, .21], [.42, .43, .3], [Math.PI / 2, 0, 0]);
    addMesh(leg, shapes.box, leatherDark, [0, -1.89, .22], [.7, .1, .91]);
    for (let lace = 0; lace < 3; lace++) addMesh(leg, shapes.box, cream, [0, -1.4 + lace * .08, .51], [.32, .025, .035], [.25, 0, 0]);
  }

  const axe = new Group(); forearms[1].add(axe); axe.position.set(0, -.71, .12);
  const tool = new StaticBatch();
  tool.add(shapes.cylinder, leather, [0, .3, .16], [.065, 1.8, .065]);
  const blade = triangleGeometry([
    -.1, .88, -.02, .67, .75, -.06, .57, 1.25, -.06,
    -.1, .88, .17, .57, 1.25, .17, .67, .75, .17,
    .67, .75, -.06, .67, .75, .17, .57, 1.25, .17,
    .67, .75, -.06, .57, 1.25, .17, .57, 1.25, -.06,
    -.1, .88, -.02, .57, 1.25, -.06, .57, 1.25, .17,
    -.1, .88, -.02, .57, 1.25, .17, -.1, .88, .17,
  ]);
  tool.add(blade, steel); blade.dispose(); axe.add(tool.finish(`${id} hatchet`));
  const bundle = new Group(); torso.add(bundle); bundle.position.set(0, 3.32, .94);
  const wood = new StaticBatch();
  for (let i = 0; i < 3; i++) wood.add(shapes.cylinder, leather, [0, (i - 1) * .22, 0], [.14, 1.75 - i * .11, .14], [0, .1 * i, Math.PI / 2]);
  bundle.add(wood.finish(`${id} carried branches`));

  const ring = new Group(); ring.position.y = .07; root.add(ring);
  const ringMaterial = material(style.ring, { emissive: young ? '#9f702a' : '#315b46', emissiveIntensity: .65 });
  const torus = addMesh(ring, shapes.torus, ringMaterial, [0, 0, 0], [NPC_RADIUS + .21, NPC_RADIUS + .21, NPC_RADIUS + .21], [Math.PI / 2, 0, 0]);
  torus.castShadow = false;
  root.scale.y = style.height;
  if (young) torso.scale.x = 1.06;
  if (explorer) torso.scale.x = .95;
  return { id, root, pivot, torso, head, arms, forearms, legs, axe, bundle, ring, warmMaterials,
    dryColors: warmMaterials.map(mat => mat.color.clone()), dryRoughness: warmMaterials.map(mat => mat.roughness),
    lastPosition: new Vector3(), yaw: .3, initialized: false, gait: 0, wasMoving: false };
}

const desired = new Vector3(), candidate = new Vector3();
const red = new Color('#c43d29'), cold = new Color('#4778a8');

export function updateCompanion(rig: CompanionRig, npc: Npc, dt: number, time: number, elapsed: number, selected: boolean, playing: boolean, reducedMotion: boolean, atmosphere: Atmosphere) {
  desired.set(npc.position.x - 50, 0, npc.position.y - 50);
  const initializing = !rig.initialized;
  if (initializing) { rig.root.position.copy(desired); rig.lastPosition.copy(desired); rig.initialized = true; rig.wasMoving = false; }
  const distance = rig.root.position.distanceTo(desired);
  const moving = playing ? npc.alive && (distance > .025 || Math.hypot(npc.position.x - npc.destination.x, npc.position.y - npc.destination.y) > .6) : rig.wasMoving;
  if (playing) rig.wasMoving = moving;
  candidate.copy(rig.root.position).lerp(desired, 1 - Math.exp(-dt * 27));
  // Reuse the real physics predicate: interpolation never draws a body through a solid corner.
  if (!playing || reducedMotion || distance > 4 || !isWalkable({ x: candidate.x + 50, y: candidate.z + 50 }, false)) rig.root.position.copy(desired);
  else rig.root.position.copy(candidate);
  const dx = desired.x - rig.lastPosition.x, dz = desired.z - rig.lastPosition.z;
  if (Math.hypot(dx, dz) > .025) rig.yaw = Math.atan2(dx, dz);
  else if (!moving && npc.action === 'fire') rig.yaw = Math.atan2(1 - desired.x, 4 - desired.z);
  else if (!moving && npc.action === 'wood') rig.yaw = Math.atan2(-30 - desired.x, -16 - desired.z);
  const angle = Math.atan2(Math.sin(rig.yaw - rig.pivot.rotation.y), Math.cos(rig.yaw - rig.pivot.rotation.y));
  if (playing || initializing) rig.pivot.rotation.y += angle * Math.min(1, dt * 12);
  rig.lastPosition.copy(desired);
  if (playing && !reducedMotion) rig.gait += dt * (moving ? 10.5 : 2.3);
  const phase = reducedMotion ? 0 : rig.gait;
  const walk = moving ? Math.sin(phase) * .63 : 0;
  const resting = npc.action === 'rest' && !moving && npc.alive;
  const working = !moving && npc.alive;
  rig.torso.position.y = moving && !reducedMotion ? Math.abs(Math.sin(phase)) * .1 : resting ? -.86 : Math.sin(phase) * .018;
  rig.torso.rotation.x = resting ? -.16 : moving ? .05 : 0;
  rig.pivot.rotation.z = 0; rig.pivot.position.y = 0;
  rig.head.rotation.set(resting ? .14 : 0, selected && !moving ? Math.sin(phase * .38) * .05 : 0, 0);
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    rig.legs[i].rotation.set(resting ? -1.1 : walk * side, 0, resting ? side * .14 : 0);
    rig.legs[i].position.y = resting ? 1.25 : 2.04;
    rig.arms[i].rotation.set(-walk * side * .7, 0, side * -.08);
    rig.forearms[i].rotation.x = -.12;
  }
  rig.axe.visible = npc.alive && npc.action === 'wood';
  const carrying = npc.inventory.wood > 0 || (working && npc.action === 'fire');
  rig.bundle.visible = npc.alive && carrying;
  if (carrying) for (const arm of rig.arms) arm.rotation.x = -1.03;
  if (working && npc.action === 'wood') {
    rig.arms[1].rotation.x = -1.15 - Math.sin(phase * 2) * .9;
    rig.forearms[1].rotation.x = -.28;
    rig.torso.rotation.x = .04 + Math.max(0, Math.sin(phase * 2)) * .13;
    rig.arms[0].rotation.x = -.5;
  }
  if (working && (npc.action === 'food' || npc.action === 'help')) {
    rig.torso.position.y = -.34; rig.torso.rotation.x = .18;
    rig.arms[1].rotation.x = -.82 - Math.sin(phase * 1.2) * .21;
    rig.arms[0].rotation.x = -.5;
  }
  if (working && npc.action === 'eat') {
    rig.arms[1].rotation.x = -1.22; rig.forearms[1].rotation.x = -1.25;
    rig.head.rotation.x = .05 + Math.sin(phase * 1.5) * .025;
  }
  if (resting) {
    rig.arms[0].rotation.x = -.5; rig.arms[1].rotation.x = -.5;
    rig.forearms[0].rotation.x = -.45; rig.forearms[1].rotation.x = -.45;
  }
  const covered = Math.abs(npc.position.x - SHELTER_COVER.center.x) <= SHELTER_COVER.half.x
    && Math.abs(npc.position.y - SHELTER_COVER.center.y) <= SHELTER_COVER.half.y;
  const exposure = covered ? .14 : 1;
  const rain = atmosphere.rainIntensity * exposure, wind = atmosphere.windStrength * exposure;
  const wetness = Math.max(0, Math.min(1, npc.wetness / 100));
  const wx = Math.cos(atmosphere.windAngle), wz = Math.sin(atmosphere.windAngle);
  const localWindX = wx * Math.cos(rig.pivot.rotation.y) - wz * Math.sin(rig.pivot.rotation.y);
  const localWindZ = wx * Math.sin(rig.pivot.rotation.y) + wz * Math.cos(rig.pivot.rotation.y);
  if (npc.alive) {
    rig.torso.rotation.x += rain * .13 + localWindZ * wind * .075;
    rig.head.rotation.x += rain * .14;
    rig.torso.rotation.z = -localWindX * wind * .075;
    if (!reducedMotion && wetness > .35 && !moving) rig.torso.rotation.z += Math.sin(time * 16 + npc.personality.bravery * 9) * wetness * .017;
    if (!carrying && !resting && npc.action !== 'wood') {
      rig.arms[0].rotation.x -= rain * .26; rig.arms[1].rotation.x -= rain * .26;
      rig.forearms[0].rotation.x -= rain * .2; rig.forearms[1].rotation.x -= rain * .2;
    }
    const thunderAge = time - atmosphere.lightningAt;
    if (!reducedMotion && atmosphere.lightningAt >= 0 && thunderAge >= 0 && thunderAge < 1.1) {
      const startle = Math.exp(-thunderAge * 4) * (1 - npc.personality.bravery * .45);
      rig.head.rotation.x -= startle * .27; rig.torso.rotation.x -= startle * .11;
      rig.arms[0].rotation.z -= startle * .38; rig.arms[1].rotation.z += startle * .38;
      rig.pivot.position.y = startle * .13;
    }
  }
  const hit = npc.collision?.lastHit;
  const hitAge = hit ? elapsed - hit.time : Infinity;
  const hurt = hitAge >= 0 && hitAge < .9 && hit?.kind !== 'bump';
  const flash = hurt && !reducedMotion ? Math.max(0, 1 - hitAge / .9) * (.28 + Math.abs(Math.sin(hitAge * 20)) * .32) : 0;
  for (let i = 0; i < rig.warmMaterials.length; i++) {
    const mat = rig.warmMaterials[i];
    mat.emissive.copy(hit?.kind === 'water' ? cold : red); mat.emissiveIntensity = flash;
    mat.color.copy(rig.dryColors[i]).multiplyScalar(1 - wetness * .15);
    mat.roughness = Math.max(.48, rig.dryRoughness[i] - wetness * .18);
  }
  if (hurt) {
    rig.pivot.rotation.z = reducedMotion ? -.09 : Math.sin(hitAge * 16) * .16 * (1 - hitAge);
    rig.torso.rotation.x -= .21 * (1 - hitAge);
    rig.head.rotation.x = -.17;
    rig.arms[0].rotation.z = -.65; rig.arms[1].rotation.z = .65;
  } else if (npc.injured && !moving) rig.torso.rotation.z -= .045;
  if (!npc.alive) {
    rig.pivot.rotation.z = Math.PI / 2; rig.pivot.position.y = .67;
    rig.torso.rotation.x = .17; rig.axe.visible = false; rig.bundle.visible = false;
  }
  rig.ring.visible = selected && npc.alive;
  rig.ring.scale.setScalar(1 + (selected && !reducedMotion ? Math.sin(time * 2) * .035 : 0));
  rig.root.updateMatrixWorld(true);
}
