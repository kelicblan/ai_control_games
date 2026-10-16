import { AnimationMixer, Box3, Group, Mesh, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3 } from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCompanion, updateCompanion } from './characters';
import type { CompanionRig } from './characters';
import type { Atmosphere, Npc, NpcId } from '../games/camp/simulation/types';
import { NPC_IDS } from '../games/camp/simulation/types';
import type { Shapes } from './geometry';

export const IMPORTED_SUBJECTS: readonly NpcId[] = NPC_IDS;
type Asset = { scene: Group; animations: AnimationClip[] };
export interface SubjectRig extends CompanionRig {
  disposed?: boolean;
  modelReady: Promise<void>;
  model?: { root: Group; mixer: AnimationMixer; actions: Record<string, AnimationAction>; active: string; hands?: [Object3D, Object3D] };
}
function release(root: Group) {
  root.traverse(object => {
    const mesh = object as Mesh;
    if ((object as SkinnedMesh).isSkinnedMesh) (object as SkinnedMesh).skeleton.dispose();
    mesh.geometry?.dispose();
    if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(mat)) if (value?.isTexture) value.dispose();
      mat.dispose();
    }
  });
}
const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
function findBone(root: Group, suffix: string): Object3D | undefined {
  let exact: Object3D | undefined, fallback: Object3D | undefined;
  root.traverse(object => { const name = normalizeName(object.name); if (name === suffix) exact = object; else if (name.endsWith(suffix)) fallback = object; });
  return exact ?? fallback;
}

export function createSubjectCharacter(id: NpcId, shapes: Shapes, loadModel?: () => Promise<Asset>): SubjectRig {
  const rig = createCompanion(id, shapes) as SubjectRig;
  rig.modelReady = Promise.resolve();
  if (!IMPORTED_SUBJECTS.includes(id)) return rig;
  rig.root.userData.modelStatus = 'loading';
  const load = loadModel ?? (() => new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/subjects/${id}/model.glb`));
  rig.modelReady = load().then(asset => {
    if (rig.disposed) { release(asset.scene); return; }
    const box = new Box3().setFromObject(asset.scene), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0 || !['Idle', 'Walk', 'Work', 'Gather', 'Rest', 'Carry'].every(name => asset.animations.some(a => a.name === name))) {
      release(asset.scene); throw new Error('Invalid commoner model or missing clips');
    }
    const root = new Group(), scale = 7.1 / size.y;
    root.scale.setScalar(scale); root.rotation.y = -Math.PI / 2;
    asset.scene.position.add(new Vector3(-center.x, -box.min.y, -center.z)); root.add(asset.scene);
    const warm: MeshStandardMaterial[] = [];
    asset.scene.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if ((mat as MeshStandardMaterial).isMeshStandardMaterial && !warm.includes(mat as MeshStandardMaterial)) warm.push(mat as MeshStandardMaterial);
      }
    });
    rig.pivot.add(root); rig.torso.visible = false; rig.legs.forEach(leg => { leg.visible = false; });
    if (warm.length) { rig.warmMaterials = warm; rig.dryColors = warm.map(mat => mat.color.clone()); rig.dryRoughness = warm.map(mat => mat.roughness); }
    const mixer = new AnimationMixer(asset.scene), actions: Record<string, AnimationAction> = {};
    for (const clip of asset.animations) actions[clip.name] = mixer.clipAction(clip);
    actions.Idle.play(); rig.model = { root, mixer, actions, active: 'Idle' };
    // Existing tools now follow the real skeleton instead of the hidden fallback.
    asset.scene.updateMatrixWorld(true);
    const hand = findBone(asset.scene, 'righthand'), spine = findBone(asset.scene, 'spine');
    const leftHand = findBone(asset.scene, 'lefthand');
    if (hand && leftHand) rig.model.hands = [leftHand, hand];
    if (hand) {
      const relative = asset.scene.getWorldQuaternion(new Quaternion()).invert().multiply(hand.getWorldQuaternion(new Quaternion()));
      hand.add(rig.axe); rig.axe.position.set(0, 0, 0); rig.axe.scale.setScalar(.12); rig.axe.quaternion.copy(relative.invert());
    }
    if (spine) for (const object of [rig.bundle, rig.basket]) {
      const relative = asset.scene.getWorldQuaternion(new Quaternion()).invert().multiply(spine.getWorldQuaternion(new Quaternion()));
      spine.add(object); object.scale.setScalar(.12); relative.invert();
      object.quaternion.copy(relative).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
      object.position.copy(new Vector3(.22, .06, 0).applyQuaternion(relative));
    }
    rig.root.userData.modelStatus = 'ready';
  }).catch(error => { if (!rig.disposed) { rig.root.userData.modelStatus = 'error'; rig.root.userData.modelError = String(error); } });
  return rig;
}
const leftGrip = new Vector3(), rightGrip = new Vector3(), carriedCenter = new Vector3(), carriedScale = new Vector3();

export function updateSubjectCharacter(rig: SubjectRig, npc: Npc, dt: number, time: number, elapsed: number, selected: boolean, playing: boolean, reducedMotion: boolean, atmosphere: Atmosphere) {
  const x = rig.root.position.x, z = rig.root.position.z, initialized = rig.initialized;
  updateCompanion(rig, npc, dt, time, elapsed, selected, playing, reducedMotion, atmosphere);
  if (!rig.model) return;
  const moving = initialized && Math.hypot(rig.root.position.x - x, rig.root.position.z - z) > .001;
  let next = 'Idle';
  if (npc.alive && !reducedMotion) {
    if (npc.inventory.wood > 0 || npc.inventory.food > 0) next = moving && rig.model.actions.WalkCarry ? 'WalkCarry' : 'Carry';
    else if (moving) next = 'Walk';
    else if (npc.action === 'wood' || npc.wildTask?.kind === 'hunt' && npc.wildTask.phase === 'work') next = 'Work';
    else if (npc.action === 'food' || npc.action === 'help' || npc.action === 'eat') next = 'Gather';
    else if (npc.action === 'rest') next = 'Rest';
  }
  if (playing && next !== rig.model.active) {
    rig.model.actions[rig.model.active].fadeOut(.2); rig.model.actions[next].reset().fadeIn(.2).play(); rig.model.active = next;
  }
  if (playing && !reducedMotion) rig.model.mixer.update(Math.min(.1, Math.max(0, dt)));
  if (rig.model.hands && (rig.bundle.visible || rig.basket.visible)) {
    rig.root.updateMatrixWorld(true);
    rig.model.hands[0].getWorldPosition(leftGrip); rig.model.hands[1].getWorldPosition(rightGrip);
    const width = leftGrip.distanceTo(rightGrip);
    for (const object of [rig.bundle, rig.basket]) if (object.visible && object.parent) {
      carriedCenter.copy(leftGrip).add(rightGrip).multiplyScalar(.5);
      object.position.copy(object.parent.worldToLocal(carriedCenter));
      object.parent.getWorldScale(carriedScale);
      object.scale.setScalar(Math.max(.04, width / ((object === rig.bundle ? 1.75 : 1.3) * Math.max(.001, carriedScale.x))));
    }
  }
  rig.root.userData.animation = rig.model.active;
}
export function disposeSubjectCharacter(rig: SubjectRig) {
  rig.disposed = true;
  if (!rig.model) return;
  rig.model.mixer.stopAllAction(); rig.model.mixer.uncacheRoot(rig.model.mixer.getRoot());
  rig.model.root.traverse(object => { if ((object as SkinnedMesh).isSkinnedMesh) (object as SkinnedMesh).skeleton.dispose(); });
}
